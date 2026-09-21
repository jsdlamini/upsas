import type {
  AssessmentConfig, AssessorEntry, ComponentOutcome, ConsultationRecord,
  Flag, MarkSnapshot, ModerationRecord, PanelResult,
} from './types';
import { assertValidConfig } from './config';
import { evaluateConsultations } from './consultation';
import { aggregatePanel } from './panel';
import { normalisePercentage, roundHalfUp, snap } from './math';

export interface PresentationInput {
  readonly componentKey: string;
  readonly entries: readonly AssessorEntry[];
  readonly moderation?: ModerationRecord;
}

export interface DocumentationInput {
  /** Raw supervisor mark and the rubric maximum it was awarded against. */
  readonly rawTotal: number;
  readonly rubricMax: number;
  readonly rubricVersionId: string;
  readonly markedBy: string;
  readonly moderatedBy?: string;
  readonly agreedRawTotal?: number;
}

/** A component passed in an earlier cycle and credited to this one. */
export interface CarriedComponentInput {
  readonly componentKey: string;
  /** Carried as a percentage, never a raw total: the earlier cycle's rubric
   *  maximum is not this cycle's, and raw totals do not travel. */
  readonly percentage: number;
  readonly fromCycleId: string;
  readonly ref: string;
}

/**
 * Where a student sits relative to the ordinary path. Absent means active,
 * which is what every existing caller means.
 */
export interface EnrolmentInput {
  readonly status: 'ACTIVE' | 'DEFERRED' | 'WITHDRAWN' | 'SUPPLEMENTARY' | 'CARRY_OVER';
  readonly carried?: readonly CarriedComponentInput[];
}

export interface ComputeInput {
  readonly studentId: string;
  readonly cycleId: string;
  readonly consultations: readonly ConsultationRecord[];
  readonly presentations: readonly PresentationInput[];
  readonly documentation?: DocumentationInput;
  readonly computedBy: string;
  readonly now?: Date;
  readonly enrolment?: EnrolmentInput;
}

/**
 * The single entry point for producing a mark. Returns an immutable snapshot
 * capturing every input, policy and rubric version used, so any published mark
 * can be reconstructed years later against the configuration then in force.
 */
export function computeFinalMark(input: ComputeInput, cfg: AssessmentConfig): MarkSnapshot {
  assertValidConfig(cfg);

  const flags: Flag[] = [];
  const rubricVersionIds = new Set<string>();
  const components: ComponentOutcome[] = [];

  // A deferred or withdrawn student is not marked at all. Running the ordinary
  // path would produce a shelf of PENDING flags that read as a department
  // behind on its marking rather than a student who is not being assessed.
  const status = input.enrolment?.status ?? 'ACTIVE';
  if (status === 'DEFERRED' || status === 'WITHDRAWN') {
    return notAssessed(input, cfg, status);
  }
  const carried = input.enrolment?.carried ?? [];

  const consultation = evaluateConsultations(input.consultations, cfg.consultation);
  if (!consultation.gateMet) {
    flags.push({
      code: 'CONSULTATION_MINIMUM_UNMET',
      blocking: cfg.consultation.gate,
      message:
        `Consultation minimum unmet: ${consultation.totalGraded} graded against ` +
        `${cfg.consultation.requiredPerPeriod} required per period ` +
        `(${cfg.consultation.periodIds.join(', ')}).`,
    });
  }

  for (const c of cfg.components) {
    if (c.kind === 'CONSULTATION') {
      const pct = consultation.percentage;
      components.push({
        key: c.key, label: c.label, kind: c.kind, weightPoints: c.weightPoints,
        percentage: pct,
        points: pct === null ? (c.weightPoints === 0 ? 0 : null) : snap((pct / 100) * c.weightPoints),
        detail: { periods: consultation.periods, gateMet: consultation.gateMet },
      });
      continue;
    }

    // Credit carried from an earlier cycle stands in for the panel. Nobody
    // marks a component the student has already passed, and the snapshot says
    // where the figure came from.
    const credit = carried.find((x) => x.componentKey === c.key);
    if (credit) {
      flags.push({
        code: 'COMPONENT_CARRIED', blocking: false,
        message: `${c.label}: ${credit.percentage}% carried from ${credit.fromCycleId} (${credit.ref}).`,
      });
      components.push({
        key: c.key, label: c.label, kind: c.kind, weightPoints: c.weightPoints,
        percentage: credit.percentage,
        points: snap((credit.percentage / 100) * c.weightPoints),
        detail: { status: 'CARRIED', source: 'CARRIED', fromCycleId: credit.fromCycleId, ref: credit.ref },
      });
      continue;
    }

    const pres = input.presentations.find((p) => p.componentKey === c.key);
    const result: PanelResult = pres
      ? aggregatePanel(pres.entries, cfg.panel, pres.moderation)
      : {
          status: 'PENDING', percentage: null, contributingAssessorIds: [],
          excludedAssessorIds: [], spread: null, source: 'PANEL',
        };

    for (const e of pres?.entries ?? []) rubricVersionIds.add(e.rubricVersionId);

    if (result.status === 'MODERATION_REQUIRED') {
      flags.push({
        code: 'PRESENTATION_MODERATION_REQUIRED', blocking: true,
        message: `${c.label}: assessor spread of ${result.spread} exceeds the ${cfg.panel.discrepancyThreshold}-point threshold.`,
      });
    } else if (result.status === 'INSUFFICIENT_ASSESSORS') {
      flags.push({
        code: 'PRESENTATION_INSUFFICIENT_ASSESSORS', blocking: true,
        message: `${c.label}: ${result.contributingAssessorIds.length} assessor(s) submitted, ${cfg.panel.minAssessors} required.`,
      });
    } else if (result.status === 'PENDING') {
      flags.push({
        code: 'PRESENTATION_PENDING', blocking: true,
        message: `${c.label}: not yet graded.`,
      });
    }

    components.push({
      key: c.key, label: c.label, kind: c.kind, weightPoints: c.weightPoints,
      percentage: result.percentage,
      points: result.percentage === null ? null : snap((result.percentage / 100) * c.weightPoints),
      detail: {
        status: result.status, spread: result.spread, source: result.source,
        contributing: result.contributingAssessorIds, excluded: result.excludedAssessorIds,
      },
    });
  }

  let documentationScore: number | null = null;
  const carriedDocumentation = carried.find((x) => x.componentKey === 'DOCUMENTATION');
  if (carriedDocumentation) {
    documentationScore = carriedDocumentation.percentage;
    flags.push({
      code: 'COMPONENT_CARRIED', blocking: false,
      message: `Documentation: ${carriedDocumentation.percentage}% carried from ` +
               `${carriedDocumentation.fromCycleId} (${carriedDocumentation.ref}).`,
    });
  } else if (input.documentation) {
    const d = input.documentation;
    rubricVersionIds.add(d.rubricVersionId);
    documentationScore = normalisePercentage(d.agreedRawTotal ?? d.rawTotal, d.rubricMax);
  } else {
    flags.push({
      code: 'DOCUMENTATION_MISSING', blocking: true,
      message: 'Final documentation has not been marked.',
    });
  }

  const blocked = flags.some((f) => f.blocking);

  const caPoints = components.every((c) => c.points !== null)
    ? snap(components.reduce((a, c) => a + (c.points as number), 0))
    : null;
  const caScore = caPoints === null ? null : snap((caPoints / cfg.caWeight) * 100);
  const documentationPoints =
    documentationScore === null ? null : snap((documentationScore / 100) * cfg.documentationWeight);

  const finalRaw =
    caPoints === null || documentationPoints === null ? null : snap(caPoints + documentationPoints);
  const finalMark = finalRaw === null ? null : roundHalfUp(finalRaw, cfg.roundingDp);

  return {
    studentId: input.studentId,
    cycleId: input.cycleId,
    configId: cfg.id,
    profileCode: cfg.profileCode,
    components,
    caPoints,
    caScore: caScore === null ? null : roundHalfUp(caScore, cfg.roundingDp),
    documentationScore,
    documentationPoints,
    finalMark,
    grade: finalMark === null || blocked ? null : gradeFor(finalMark, cfg),
    flags,
    blocked,
    rubricVersionIds: [...rubricVersionIds].sort(),
    policies: {
      consultation: cfg.consultation.policy,
      panel: cfg.panel.aggregation,
      rounding: `HALF_UP@${cfg.roundingDp}dp`,
    },
    computedAt: (input.now ?? new Date()).toISOString(),
    computedBy: input.computedBy,
  };
}

/**
 * The snapshot for a student who is not being assessed this cycle. It is a real
 * snapshot rather than a null, so the provenance of the decision is recorded
 * the same way every other mark decision is.
 */
function notAssessed(
  input: ComputeInput, cfg: AssessmentConfig, status: 'DEFERRED' | 'WITHDRAWN',
): MarkSnapshot {
  return {
    studentId: input.studentId,
    cycleId: input.cycleId,
    configId: cfg.id,
    profileCode: cfg.profileCode,
    components: [],
    caPoints: null,
    caScore: null,
    documentationScore: null,
    documentationPoints: null,
    finalMark: null,
    grade: null,
    flags: [{
      code: 'NOT_ASSESSED_THIS_CYCLE', blocking: true,
      message: status === 'DEFERRED'
        ? 'Deferred: not assessed this cycle. Records are kept and resume on return.'
        : 'Withdrawn: not assessed this cycle.',
    }],
    blocked: true,
    rubricVersionIds: [],
    policies: {
      consultation: cfg.consultation.policy,
      panel: cfg.panel.aggregation,
      rounding: `HALF_UP@${cfg.roundingDp}dp`,
    },
    computedAt: (input.now ?? new Date()).toISOString(),
    computedBy: input.computedBy,
  };
}

function gradeFor(mark: number, cfg: AssessmentConfig): string | null {
  const band = [...cfg.gradeBands].sort((a, b) => b.min - a.min).find((b) => mark >= b.min);
  return band?.grade ?? null;
}
