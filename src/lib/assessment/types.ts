/**
 * Core assessment types.
 *
 * Every score carries BOTH its raw total and the rubric maximum in force when
 * awarded. Nothing downstream may consume a raw total without dividing by its
 * recorded maximum — the live rubrics differ (P1 = 40, P2 = 80, documentation
 * = 100) and comparing raw totals is a defect.
 */

export type ComponentKind = 'CONSULTATION' | 'PRESENTATION';

export interface RubricCriterion {
  readonly id: string;
  readonly label: string;
  readonly max: number;
}

export interface RubricVersion {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  /** Sum of criterion maxima. Persisted, never recomputed from a live rubric. */
  readonly max: number;
  readonly criteria: readonly RubricCriterion[];
  /** Set true the moment the version is first used to grade. Edits fork. */
  readonly locked: boolean;
}

/** One assessor's sheet for one student for one presentation. */
export interface AssessorEntry {
  readonly assessorId: string;
  readonly rubricVersionId: string;
  readonly rubricMax: number;
  /** null = criterion not scored. All-null = assessor absent for that session. */
  readonly criterionScores: Readonly<Record<string, number | null>>;
  /** An assessor's sheet counts only once explicitly submitted (= signed). */
  readonly submitted: boolean;
  readonly isSupervisor?: boolean;
}

export type ConsultationStatus =
  | 'REQUESTED' | 'CONFIRMED' | 'RESCHEDULED' | 'COMPLETED'
  | 'NO_SHOW_STUDENT' | 'NO_SHOW_SUPERVISOR' | 'CANCELLED';

export interface ConsultationRecord {
  readonly id: string;
  readonly periodId: string;
  readonly status: ConsultationStatus;
  readonly supervisorAttested: boolean;
  readonly studentAttested: boolean;
  /** Normalised percentage 0..100, or null where the profile does not grade. */
  readonly score: number | null;
}

export type ConsultationPolicy =
  | 'MEAN_WITH_COMPLIANCE_FACTOR' | 'MEAN_ALL' | 'MEAN_NO_BONUS'
  | 'BEST_N' | 'GATE_ONLY';

export type PanelAggregation =
  | 'MEAN' | 'TRIMMED_MEAN' | 'MEDIAN' | 'SUPERVISOR_EXCLUDED_MEAN';

export type PanelStatus =
  | 'OK' | 'PENDING' | 'INSUFFICIENT_ASSESSORS' | 'MODERATION_REQUIRED';

export interface ModerationRecord {
  readonly moderatorId: string;
  readonly rationale: string;
  readonly agreedPercentage: number;
  readonly moderatedAt: string;
}

export interface PanelResult {
  readonly status: PanelStatus;
  readonly percentage: number | null;
  readonly contributingAssessorIds: readonly string[];
  readonly excludedAssessorIds: readonly string[];
  readonly spread: number | null;
  readonly source: 'PANEL' | 'MODERATED';
}

export interface ComponentConfig {
  readonly key: string;
  readonly label: string;
  readonly kind: ComponentKind;
  /** Points out of the FINAL mark, not out of CA. Must sum to caWeight. */
  readonly weightPoints: number;
  readonly rubricCode?: string;
}

export interface ConsultationConfig {
  readonly policy: ConsultationPolicy;
  readonly requiredPerPeriod: number;
  readonly periodIds: readonly string[];
  readonly engagementStep: number;
  readonly engagementCap: number;
  /** When true, failing the minimum blocks progression regardless of weight. */
  readonly gate: boolean;
  readonly requireStudentAttestation: boolean;
  readonly bestN?: number;
}

export interface PanelConfig {
  readonly aggregation: PanelAggregation;
  readonly minAssessors: number;
  /** Normalised-percentage points between highest and lowest assessor. */
  readonly discrepancyThreshold: number;
}

export interface AssessmentConfig {
  readonly id: string;
  readonly profileCode: string;
  readonly profileLabel: string;
  readonly caWeight: number;
  readonly documentationWeight: number;
  readonly components: readonly ComponentConfig[];
  readonly consultation: ConsultationConfig;
  readonly panel: PanelConfig;
  readonly roundingDp: number;
  readonly gradeBands: readonly GradeBand[];
}

export interface ComponentOutcome {
  readonly key: string;
  readonly label: string;
  readonly kind: ComponentKind;
  readonly weightPoints: number;
  readonly percentage: number | null;
  readonly points: number | null;
  readonly detail: Record<string, unknown>;
}

export type FlagCode =
  | 'CONSULTATION_MINIMUM_UNMET'
  | 'PRESENTATION_MODERATION_REQUIRED'
  | 'PRESENTATION_INSUFFICIENT_ASSESSORS'
  | 'PRESENTATION_PENDING'
  | 'DOCUMENTATION_MISSING'
  /** The student is deferred or withdrawn: no mark is produced this cycle. */
  | 'NOT_ASSESSED_THIS_CYCLE'
  /** A component credited from an earlier cycle rather than marked in this one. */
  | 'COMPONENT_CARRIED';

export interface Flag {
  readonly code: FlagCode;
  readonly blocking: boolean;
  readonly message: string;
}

export interface GradeBand {
  readonly grade: string;
  readonly min: number;
}

export interface MarkSnapshot {
  readonly studentId: string;
  readonly cycleId: string;
  readonly configId: string;
  readonly profileCode: string;
  readonly components: readonly ComponentOutcome[];
  readonly caPoints: number | null;
  readonly caScore: number | null;
  readonly documentationScore: number | null;
  readonly documentationPoints: number | null;
  readonly finalMark: number | null;
  readonly grade: string | null;
  readonly flags: readonly Flag[];
  readonly blocked: boolean;
  readonly rubricVersionIds: readonly string[];
  readonly policies: Readonly<Record<string, string>>;
  readonly computedAt: string;
  readonly computedBy: string;
}
