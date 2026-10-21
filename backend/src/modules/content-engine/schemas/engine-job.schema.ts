import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ENGINE_PIPELINE_STAGES,
  ENGINE_JOB_STATUSES,
  EnginePipelineStage,
  EngineJobStatus,
} from '../domain/content-engine.constants';

/**
 * One generation job.
 *
 * Durability lives in three fields and one index:
 *
 *   requestHash   unique — the same request submitted twice is one job
 *   leaseOwner/   who holds it and until when
 *   leaseExpiresAt
 *   leaseEpoch    a fencing token, incremented on every claim
 *
 * `leaseEpoch` is what makes a *stale* worker harmless rather than merely
 * unlikely. A worker that pauses past its expiry, loses the lease to another
 * process and then wakes up still believes it owns the job; every write it
 * makes is conditioned on its epoch, so the write matches nothing and the job
 * is untouched. Expiry alone does not give that guarantee — it only decides who
 * may claim next.
 */
@Schema({ collection: 'engine_jobs', timestamps: true })
export class EngineJobDocument {
  /**
   * Caller-supplied identity of the request: mechanic + world + scope + target
   * count + prompt revision. Two submissions that hash alike are the same work.
   */
  @Prop({ type: String, required: true })
  requestHash!: string;

  @Prop({ type: String, required: true })
  mechanicKey!: string;

  @Prop({ type: String, required: true })
  worldKey!: string;

  @Prop({ type: String, required: true })
  scopeKey!: string;

  @Prop({ type: Number, required: true, min: 1 })
  targetCount!: number;

  @Prop({
    type: String,
    required: true,
    enum: ENGINE_JOB_STATUSES,
    default: 'queued',
  })
  status!: EngineJobStatus;

  @Prop({ type: String, default: null })
  leaseOwner!: string | null;

  @Prop({ type: Date, default: null })
  leaseExpiresAt!: Date | null;

  /** Fencing token. Monotonic per job; never reset. */
  @Prop({ type: Number, required: true, default: 0 })
  leaseEpoch!: number;

  /** Charged attempts, including the ones that failed. */
  @Prop({ type: Number, required: true, default: 0 })
  attempts!: number;

  /** Set when a job reaches `failed`, so a human can see why without logs. */
  @Prop({ type: String, default: null })
  lastError!: string | null;

  /**
   * Cancellation is a *request*, not an interruption. An in-flight provider
   * call cannot be unsent, so the worker observes this between stages and the
   * outstanding reservation still reconciles.
   */
  @Prop({ type: Boolean, required: true, default: false })
  cancellationRequested!: boolean;

  @Prop({ type: Number, required: true, default: 0 })
  reservedMicros!: number;

  @Prop({ type: Number, required: true, default: 0 })
  spentMicros!: number;

  @Prop({
    type: String,
    required: true,
    enum: ENGINE_PIPELINE_STAGES,
    default: 'pending',
  })
  pipelineStage!: EnginePipelineStage;

  /** Stage name -> immutable completion evidence used for crash recovery. */
  @Prop({ type: Object, required: true, default: {} })
  stageCheckpoints!: Record<string, Record<string, unknown>>;

  @Prop({ type: String, default: null })
  awaitingReviewReason!: string | null;
}

export type EngineJob = HydratedDocument<EngineJobDocument>;
export const EngineJobSchema = SchemaFactory.createForClass(EngineJobDocument);

/** The lock behind idempotent submission. Two racing inserts: one survives. */
EngineJobSchema.index({ requestHash: 1 }, { unique: true });

/** Drives both "what may I claim" and the expired-lease recovery sweep. */
EngineJobSchema.index({ status: 1, leaseExpiresAt: 1 });
