import type { ConsultationConfig, ConsultationRecord } from './types';
import { clamp, mean, snap } from './math';

export interface ConsultationPeriodResult {
  readonly periodId: string;
  readonly gradedCount: number;
  readonly requiredCount: number;
  readonly noShowCount: number;
  readonly rawMean: number | null;
  readonly complianceFactor: number;
  readonly engagementBonus: number;
  readonly score: number | null;
  readonly gateMet: boolean;
}

export interface ConsultationOutcome {
  readonly periods: readonly ConsultationPeriodResult[];
  readonly percentage: number | null;
  readonly gateMet: boolean;
  readonly totalGraded: number;
}

/**
 * A consultation counts only when it was held, both parties attested, and it
 * carries a grade. No-shows and cancellations are recorded but excluded from
 * the average — they must never be treated as zero.
 */
export function countable(r: ConsultationRecord, cfg: ConsultationConfig): boolean {
  if (r.status !== 'COMPLETED') return false;
  if (!r.supervisorAttested) return false;
  if (cfg.requireStudentAttestation && !r.studentAttested) return false;
  return r.score !== null;
}

function periodScore(
  scores: readonly number[],
  cfg: ConsultationConfig,
): { rawMean: number | null; compliance: number; engagement: number; score: number | null } {
  const graded = scores.length;
  const required = cfg.requiredPerPeriod;

  if (cfg.policy === 'GATE_ONLY') {
    return { rawMean: graded > 0 ? mean(scores) : null, compliance: 1, engagement: 0, score: null };
  }
  if (graded === 0) {
    return { rawMean: null, compliance: 0, engagement: 0, score: 0 };
  }

  switch (cfg.policy) {
    case 'MEAN_ALL': {
      const m = mean(scores);
      return { rawMean: m, compliance: 1, engagement: 0, score: m };
    }
    case 'BEST_N': {
      const n = cfg.bestN ?? required;
      const best = [...scores].sort((a, b) => b - a).slice(0, n);
      const m = mean(best);
      return { rawMean: mean(scores), compliance: 1, engagement: 0, score: m };
    }
    case 'MEAN_NO_BONUS': {
      const m = mean(scores);
      const compliance = Math.min(1, graded / required);
      return { rawMean: m, compliance, engagement: 0, score: snap(m * compliance) };
    }
    case 'MEAN_WITH_COMPLIANCE_FACTOR':
    default: {
      const m = mean(scores);
      const compliance = Math.min(1, graded / required);
      const extra = Math.max(0, graded - required);
      const engagement = Math.min(cfg.engagementCap, cfg.engagementStep * extra);
      const score = clamp(snap(m * compliance + engagement), 0, 100);
      return { rawMean: m, compliance, engagement, score };
    }
  }
}

export function evaluateConsultations(
  records: readonly ConsultationRecord[],
  cfg: ConsultationConfig,
): ConsultationOutcome {
  const periods = cfg.periodIds.map<ConsultationPeriodResult>((periodId) => {
    const inPeriod = records.filter((r) => r.periodId === periodId);
    const graded = inPeriod.filter((r) => countable(r, cfg));
    const scores = graded.map((r) => r.score as number);
    const noShowCount = inPeriod.filter(
      (r) => r.status === 'NO_SHOW_STUDENT' || r.status === 'NO_SHOW_SUPERVISOR',
    ).length;
    const { rawMean, compliance, engagement, score } = periodScore(scores, cfg);
    return {
      periodId,
      gradedCount: graded.length,
      requiredCount: cfg.requiredPerPeriod,
      noShowCount,
      rawMean,
      complianceFactor: compliance,
      engagementBonus: engagement,
      score,
      gateMet: graded.length >= cfg.requiredPerPeriod,
    };
  });

  const scored = periods.map((p) => p.score).filter((s): s is number => s !== null);
  const percentage = scored.length > 0 ? mean(scored) : null;
  const totalGraded = periods.reduce((a, p) => a + p.gradedCount, 0);

  return {
    periods,
    percentage,
    gateMet: periods.every((p) => p.gateMet),
    totalGraded,
  };
}
