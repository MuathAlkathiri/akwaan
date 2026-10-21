import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  COST_ENTRY_STATUSES,
  CostEntryStatus,
  USAGE_SOURCES,
  UsageSource,
} from '../domain/content-engine.constants';

/**
 * One provider call's money, from reservation to settlement.
 *
 * `reservationId` is unique, and that single index is what makes reconciliation
 * idempotent: a retried reconcile finds the entry already out of `reserved`
 * state and does nothing, so the budget cannot be credited or debited twice by
 * a duplicated callback, a restarted worker, or an at-least-once delivery.
 *
 * The entry is written *before* the call and settled after, so a crash between
 * the two leaves evidence rather than a silent hole in the accounting.
 */
@Schema({ collection: 'engine_cost_ledger', timestamps: true })
export class EngineCostEntryDocument {
  /** Caller-supplied, unique. Usually `${jobId}:${stage}:${attempt}`. */
  @Prop({ type: String, required: true })
  reservationId!: string;

  @Prop({ type: String, required: true })
  jobId!: string;

  /** Which pipeline stage spent this — generation, judging, verification… */
  @Prop({ type: String, required: true })
  stage!: string;

  @Prop({ type: String, required: true })
  provider!: string;

  @Prop({ type: String, required: true })
  model!: string;

  @Prop({ type: Number, required: true })
  reservedMicros!: number;

  /** Null until reconciled. */
  @Prop({ type: Number, default: null })
  actualMicros!: number | null;

  @Prop({ type: String, required: true, enum: COST_ENTRY_STATUSES })
  status!: CostEntryStatus;

  /** How `actualMicros` was arrived at. */
  @Prop({ type: String, default: null, enum: [...USAGE_SOURCES, null] })
  usageSource!: UsageSource | null;

  /**
   * False whenever the provider did not report usage — including the ambiguous
   * timeout, where the call may have been billed and nothing observable says so.
   */
  @Prop({ type: Boolean, required: true, default: false })
  usageKnown!: boolean;

  @Prop({ type: Object, default: null })
  reportedUsage!: Record<string, number> | null;

  /**
   * What the provider said about the call, beyond token counts.
   *
   * **Measured values only** — every key here is copied from the provider's
   * own response (reasoning-token splits, its reported cost in its own
   * currency). Nothing derived or estimated is written here, so a reader never
   * has to guess which numbers were observed.
   *
   * Observation only: it is deliberately *not* an input to `actualMicros`.
   * The ledger prices tokens at configured rates in SAR micros; a
   * provider-reported USD figure is recorded beside that for comparison, never
   * folded into settled money. Null on every entry written before this field
   * existed, and on any provider that reports nothing.
   */
  @Prop({ type: Object, default: null })
  providerDiagnostics!: Record<string, unknown> | null;

  /**
   * True when the settled cost landed above what was reserved. Recorded rather
   * than prevented: a reservation bounds an *estimate*, never a provider's bill.
   */
  @Prop({ type: Boolean, required: true, default: false })
  exceededReservation!: boolean;

  /**
   * Set only when a cap was deliberately overridden. Phase 1a never writes
   * these — no authenticated, audited approval flow exists yet — but the shape
   * is fixed now so an override can never be recorded without an actor.
   */
  @Prop({ type: Boolean, required: true, default: false })
  budgetOverride!: boolean;

  @Prop({ type: String, default: null })
  overrideAuthorizedBy!: string | null;
}

export type EngineCostEntry = HydratedDocument<EngineCostEntryDocument>;
export const EngineCostEntrySchema = SchemaFactory.createForClass(
  EngineCostEntryDocument,
);

/** The idempotency lock for reconciliation. */
EngineCostEntrySchema.index({ reservationId: 1 }, { unique: true });

/** Recovery sweep: find reservations stranded by a crash. */
EngineCostEntrySchema.index({ status: 1, createdAt: 1 });

/** Auditing a job's spend. */
EngineCostEntrySchema.index({ jobId: 1 });
