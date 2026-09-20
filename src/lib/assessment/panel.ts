import type {
  AssessorEntry, ModerationRecord, PanelConfig, PanelResult,
} from './types';
import { mean, median, normalisePercentage, snap } from './math';

/**
 * A sheet contributes only when the assessor submitted it AND scored at least
 * one criterion. A blank row means "absent for that session" and is excluded —
 * it must never be averaged in as zero, which would silently depress the mark.
 */
function rawTotal(entry: AssessorEntry): number | null {
  const values = Object.values(entry.criterionScores).filter(
    (v): v is number => v !== null && v !== undefined,
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

export function aggregatePanel(
  entries: readonly AssessorEntry[],
  cfg: PanelConfig,
  moderation?: ModerationRecord,
): PanelResult {
  const contributing: { assessorId: string; pct: number; isSupervisor: boolean }[] = [];
  const excluded: string[] = [];

  for (const e of entries) {
    const total = e.submitted ? rawTotal(e) : null;
    if (total === null) {
      excluded.push(e.assessorId);
      continue;
    }
    contributing.push({
      assessorId: e.assessorId,
      pct: normalisePercentage(total, e.rubricMax),
      isSupervisor: e.isSupervisor === true,
    });
  }

  if (moderation) {
    return {
      status: 'OK',
      percentage: snap(moderation.agreedPercentage),
      contributingAssessorIds: contributing.map((c) => c.assessorId),
      excludedAssessorIds: excluded,
      spread: spreadOf(contributing.map((c) => c.pct)),
      source: 'MODERATED',
    };
  }

  if (contributing.length === 0) {
    return {
      status: 'PENDING', percentage: null,
      contributingAssessorIds: [], excludedAssessorIds: excluded,
      spread: null, source: 'PANEL',
    };
  }

  if (contributing.length < cfg.minAssessors) {
    return {
      status: 'INSUFFICIENT_ASSESSORS', percentage: null,
      contributingAssessorIds: contributing.map((c) => c.assessorId),
      excludedAssessorIds: excluded,
      spread: spreadOf(contributing.map((c) => c.pct)), source: 'PANEL',
    };
  }

  const spread = spreadOf(contributing.map((c) => c.pct));
  if (spread !== null && spread > cfg.discrepancyThreshold) {
    return {
      status: 'MODERATION_REQUIRED', percentage: null,
      contributingAssessorIds: contributing.map((c) => c.assessorId),
      excludedAssessorIds: excluded, spread, source: 'PANEL',
    };
  }

  let pool = contributing;
  if (cfg.aggregation === 'SUPERVISOR_EXCLUDED_MEAN') {
    const withoutSupervisor = contributing.filter((c) => !c.isSupervisor);
    if (withoutSupervisor.length >= cfg.minAssessors) pool = withoutSupervisor;
  }

  const values = pool.map((c) => c.pct);
  let percentage: number;
  switch (cfg.aggregation) {
    case 'MEDIAN':
      percentage = median(values);
      break;
    case 'TRIMMED_MEAN': {
      if (values.length >= 3) {
        const sorted = [...values].sort((a, b) => a - b).slice(1, -1);
        percentage = mean(sorted);
      } else {
        percentage = mean(values);
      }
      break;
    }
    default:
      percentage = mean(values);
  }

  return {
    status: 'OK', percentage,
    contributingAssessorIds: pool.map((c) => c.assessorId),
    excludedAssessorIds: excluded, spread, source: 'PANEL',
  };
}

function spreadOf(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  return snap(Math.max(...values) - Math.min(...values));
}
