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

export interface ComputeInput {
  readonly studentId: string;
  readonly cycleId: string;
  readonly consultations: readonly ConsultationRecord[];
  readonly presentations: readonly PresentationInput[];
  readonly documentation?: DocumentationInput;
  readonly computedBy: string;
  readonly now?: Date;
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
  if (input.documentation) {
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

function gradeFor(mark: number, cfg: AssessmentConfig): string | null {
  const band = [...cfg.gradeBands].sort((a, b) => b.min - a.min).find((b) => mark >= b.min);
  return band?.grade ?? null;
}
