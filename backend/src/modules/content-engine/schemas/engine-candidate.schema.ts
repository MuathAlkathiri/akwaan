import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const CANDIDATE_STATUSES = [
  'generated',
  'screened_pass',
  'screened_reject',
  'fact_blocked',
  'awaiting_review',
  'generation_failed',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const CANDIDATE_REVIEW_STATUSES = [
  'pending',
  'approved',
  'rejected',
] as const;
export type CandidateReviewStatus = (typeof CANDIDATE_REVIEW_STATUSES)[number];

@Schema({ _id: false })
export class CandidateReviewEvent {
  @Prop({ type: String, required: true })
  action!:
    | 'edited'
    | 'assessment_invalidated'
    | 'assessed'
    | 'approved'
    | 'rejected'
    | 'draft_created';

  @Prop({ type: String, required: true }) actorId!: string;
  @Prop({ type: String, required: true }) actorEmail!: string;
  @Prop({ type: Date, required: true }) occurredAt!: Date;
  @Prop({ type: Number, required: true }) revision!: number;
  @Prop({ type: String, default: null }) reasonCode!: string | null;
  @Prop({ type: String, default: null }) explanation!: string | null;
  @Prop({ type: Object, default: null }) details!: Record<
    string,
    unknown
  > | null;
}
export const CandidateReviewEventSchema =
  SchemaFactory.createForClass(CandidateReviewEvent);

/** One screening finding. `deferred` is a check that cannot run yet. */
@Schema({ _id: false })
export class ScreenFinding {
  @Prop({ type: String, required: true })
  code!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['blocking', 'warning', 'deferred'],
  })
  severity!: 'blocking' | 'warning' | 'deferred';

  @Prop({ type: String, required: true })
  message!: string;
}
export const ScreenFindingSchema = SchemaFactory.createForClass(ScreenFinding);

/**
 * One generated candidate, before any human sees it.
 *
 * This is **not** a ContentItem and never becomes one here. It holds a draft
 * shaped like `CreateContentItemDto` plus the evidence of how it was judged, so
 * that Phase 1c can verify and judge it and Phase 1d can publish it through the
 * ordinary Admin service. Nothing in this collection is canonical content.
 *
 * `(jobId, ordinal)` is unique: a job that is retried after a crash regenerates
 * into the same slots rather than accumulating duplicates, which is what makes
 * recovery safe to run more than once.
 */
@Schema({ collection: 'engine_candidates', timestamps: true })
export class EngineCandidateDocument {
  @Prop({ type: String, required: true })
  candidateId!: string;

  @Prop({ type: String, required: true })
  jobId!: string;

  /** Position within the batch. Stable across regeneration. */
  @Prop({ type: Number, required: true })
  ordinal!: number;

  @Prop({ type: String, required: true, enum: CANDIDATE_STATUSES })
  status!: CandidateStatus;

  /** Shaped as `CreateContentItemDto`. Never written to ContentItem here. */
  @Prop({ type: Object, default: null })
  draft!: Record<string, unknown> | null;

  @Prop({ type: [ScreenFindingSchema], default: [] })
  findings!: ScreenFinding[];

  /** Reproducibility: which context and which prompt produced this. */
  @Prop({ type: String, required: true })
  contextHash!: string;

  @Prop({ type: String, required: true })
  promptVersion!: string;

  @Prop({ type: String, required: true })
  provider!: string;

  @Prop({ type: String, required: true })
  model!: string;

  /** The attempt that produced it, so a retry is distinguishable. */
  @Prop({ type: Number, required: true, default: 0 })
  attempt!: number;

  @Prop({ type: String, default: null })
  failureReason!: string | null;

  /** Candidate assertions are kept out of the future ContentItem DTO. */
  @Prop({ type: [String], default: [] })
  factualClaims!: string[];

  /**
   * Authoring rationale: the concept, the player's intended route to a close
   * answer, and the model's own step-grid arithmetic. Deliberately outside
   * `draft`, which is validated against `CreateContentItemDto` with
   * `forbidNonWhitelisted` — and these never belong to gameplay anyway.
   */
  @Prop({ type: Object, default: null })
  authoring!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  factVerification!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  qualityEvaluation!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  compatibilityEvaluation!: Record<string, unknown> | null;

  /** Human review is authoritative and uses this revision as its CAS token. */
  @Prop({ type: Number, required: true, default: 0 })
  reviewRevision!: number;

  @Prop({
    type: String,
    required: true,
    enum: CANDIDATE_REVIEW_STATUSES,
    default: 'pending',
  })
  reviewStatus!: CandidateReviewStatus;

  @Prop({ type: Object, default: null })
  humanAssessment!: Record<string, unknown> | null;

  /**
   * Historical snapshot of automated and human assessments invalidated by the
   * most recent material human edit. Kept separate from active assessment
   * fields so stale assessments can never satisfy approval gates.
   */
  @Prop({ type: Object, default: null })
  lastInvalidatedAssessments!: Record<string, unknown> | null;

  @Prop({ type: Object, default: null })
  reviewDecision!: Record<string, unknown> | null;

  @Prop({ type: [CandidateReviewEventSchema], default: [] })
  reviewEvents!: CandidateReviewEvent[];

  /** Convenience pointer only. Uniqueness is enforced by engine_draft_publications. */
  @Prop({ type: String, default: null })
  publishedContentItemId!: string | null;

  /** Last lease epoch allowed to mutate this candidate. */
  @Prop({ type: Number, required: true, default: 0 })
  writeEpoch!: number;
}

export type EngineCandidate = HydratedDocument<EngineCandidateDocument>;
export const EngineCandidateSchema = SchemaFactory.createForClass(
  EngineCandidateDocument,
);

EngineCandidateSchema.index({ candidateId: 1 }, { unique: true });
/** Idempotent regeneration: one candidate per slot per job. */
EngineCandidateSchema.index({ jobId: 1, ordinal: 1 }, { unique: true });
EngineCandidateSchema.index({ jobId: 1, status: 1 });
EngineCandidateSchema.index({ reviewStatus: 1, updatedAt: -1 });
