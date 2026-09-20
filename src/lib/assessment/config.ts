import type { AssessmentConfig, GradeBand } from './types';
import { snap } from './math';

export interface ConfigError {
  readonly field: string;
  readonly message: string;
}

/**
 * Configuration invariants. These are the guard rails that stop a department
 * from publishing an arithmetically impossible assessment scheme.
 */
export function validateConfig(cfg: AssessmentConfig): ConfigError[] {
  const errors: ConfigError[] = [];

  if (cfg.caWeight < 0 || cfg.documentationWeight < 0) {
    errors.push({ field: 'weights', message: 'Weights may not be negative.' });
  }
  if (snap(cfg.caWeight + cfg.documentationWeight) !== 100) {
    errors.push({
      field: 'caWeight+documentationWeight',
      message: `CA (${cfg.caWeight}) + documentation (${cfg.documentationWeight}) must equal 100, got ${snap(cfg.caWeight + cfg.documentationWeight)}.`,
    });
  }

  const sum = snap(cfg.components.reduce((a, c) => a + c.weightPoints, 0));
  if (sum !== snap(cfg.caWeight)) {
    errors.push({
      field: 'components',
      message: `CA sub-components sum to ${sum} but CA weight is ${cfg.caWeight}. They must be equal.`,
    });
  }

  const keys = new Set<string>();
  for (const c of cfg.components) {
    if (keys.has(c.key)) {
      errors.push({ field: `components.${c.key}`, message: 'Duplicate component key.' });
    }
    keys.add(c.key);
    if (c.weightPoints < 0) {
      errors.push({ field: `components.${c.key}`, message: 'Weight may not be negative.' });
    }
  }

  const consultationComponents = cfg.components.filter((c) => c.kind === 'CONSULTATION');
  if (consultationComponents.length > 1) {
    errors.push({ field: 'components', message: 'At most one consultation component.' });
  }
  const consultationWeight = consultationComponents.reduce((a, c) => a + c.weightPoints, 0);
  if (consultationWeight > 0 && cfg.consultation.policy === 'GATE_ONLY') {
    errors.push({
      field: 'consultation.policy',
      message: 'GATE_ONLY awards no marks, so the consultation component must be weighted 0.',
    });
  }
  if (consultationWeight === 0 && cfg.consultation.policy !== 'GATE_ONLY' && !cfg.consultation.gate) {
    errors.push({
      field: 'consultation',
      message: 'Consultation carries no weight and no gate — it would have no effect.',
    });
  }

  if (cfg.consultation.requiredPerPeriod < 0) {
    errors.push({ field: 'consultation.requiredPerPeriod', message: 'Must be >= 0.' });
  }
  if (cfg.consultation.periodIds.length === 0) {
    errors.push({ field: 'consultation.periodIds', message: 'At least one period required.' });
  }
  if (cfg.panel.minAssessors < 1) {
    errors.push({ field: 'panel.minAssessors', message: 'Must be >= 1.' });
  }
  if (cfg.panel.discrepancyThreshold <= 0) {
    errors.push({ field: 'panel.discrepancyThreshold', message: 'Must be > 0.' });
  }

  return errors;
}

export function assertValidConfig(cfg: AssessmentConfig): void {
  const errors = validateConfig(cfg);
  if (errors.length > 0) {
    throw new Error(
      `Invalid assessment configuration:\n${errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n')}`,
    );
  }
}

/** PROVISIONAL — confirm against the official UNESWA scheme before go-live. */
export const PROVISIONAL_GRADE_BANDS: readonly GradeBand[] = [
  { grade: 'A', min: 80 },
  { grade: 'B', min: 70 },
  { grade: 'C', min: 60 },
  { grade: 'D', min: 50 },
  { grade: 'F', min: 0 },
];

/**
 * Profile A — "Consultation-Weighted". The incoming policy. System default.
 */
export const PROFILE_A: AssessmentConfig = {
  id: 'cfg-profile-a-v1',
  profileCode: 'A',
  profileLabel: 'Consultation-Weighted (2026 proposal)',
  caWeight: 40,
  documentationWeight: 60,
  components: [
    { key: 'consultation', label: 'Supervision consultations', kind: 'CONSULTATION', weightPoints: 20 },
    { key: 'p1', label: 'Presentation 1 — Chapters 1–2', kind: 'PRESENTATION', weightPoints: 10, rubricCode: 'P1' },
    { key: 'p2', label: 'Presentation 2 — Chapters 3–5', kind: 'PRESENTATION', weightPoints: 10, rubricCode: 'P2' },
  ],
  consultation: {
    policy: 'MEAN_WITH_COMPLIANCE_FACTOR',
    requiredPerPeriod: 4,
    periodIds: ['SEM1', 'SEM2'],
    engagementStep: 2,
    engagementCap: 5,
    gate: false,
    requireStudentAttestation: true,
  },
  panel: { aggregation: 'MEAN', minAssessors: 3, discrepancyThreshold: 15 },
  roundingDp: 1,
  gradeBands: PROVISIONAL_GRADE_BANDS,
};

/**
 * Profile B — "Legacy 2022". Reproduces the departmental guidelines exactly:
 * presentations take the whole of CA at 30/70, and the ten-consultation
 * requirement is an eligibility gate carrying no marks.
 */
export const PROFILE_B: AssessmentConfig = {
  id: 'cfg-profile-b-v1',
  profileCode: 'B',
  profileLabel: 'Legacy 2022 guidelines',
  caWeight: 40,
  documentationWeight: 60,
  components: [
    { key: 'consultation', label: 'Supervision consultations (gate only)', kind: 'CONSULTATION', weightPoints: 0 },
    { key: 'p1', label: 'Presentation 1 — Chapters 1–2', kind: 'PRESENTATION', weightPoints: 12, rubricCode: 'P1' },
    { key: 'p2', label: 'Presentation 2 — Chapters 3–5', kind: 'PRESENTATION', weightPoints: 28, rubricCode: 'P2' },
  ],
  consultation: {
    policy: 'GATE_ONLY',
    requiredPerPeriod: 5,
    periodIds: ['SEM1', 'SEM2'],
    engagementStep: 0,
    engagementCap: 0,
    gate: true,
    requireStudentAttestation: true,
  },
  panel: { aggregation: 'MEAN', minAssessors: 3, discrepancyThreshold: 15 },
  roundingDp: 1,
  gradeBands: PROVISIONAL_GRADE_BANDS,
};
