/**
 * Akwaan Content Engine — Phase 1a foundation (roadmap §30).
 *
 * This module owns jobs, leases and money. It does not generate content, call a
 * provider, or create a ContentItem; those arrive in later phases. What exists
 * here is the part that has to be right *before* anything is allowed to spend.
 */

/**
 * The engine's own AI provider slot.
 *
 * Deliberately *not* `AI_PROVIDER_TOKEN`. That token is published by the
 * `@Global()` `AiTextProviderModule`, and binding it inside this module would
 * silently shadow the application-wide provider for everything resolved here —
 * a trap that would surface in Phase 1c as "the engine mysteriously has no
 * provider". The engine declares its own dependency and leaves the global
 * resolution untouched.
 *
 * Bound to `undefined` by default: Phase 1b authorizes no live provider call,
 * and an unbound slot makes that structural rather than a promise.
 */
export const ENGINE_AI_PROVIDER = Symbol('ENGINE_AI_PROVIDER');

/**
 * Live-provider flag, separate from `CONTENT_ENGINE_ENABLED` on purpose.
 *
 * Turning the engine on must not, by itself, authorize spending money. The
 * pipeline runs end to end against a fake provider with the engine enabled and
 * this off; only this flag — plus a key, a model and a configured price — makes
 * a paid call possible.
 */
export const ENGINE_LIVE_PROVIDER_ENABLED = 'ENGINE_LIVE_PROVIDER_ENABLED';

/**
 * Evidence retrieval, flagged separately from the engine and from live
 * generation.
 *
 * Retrieval is its own external dependency with its own failure modes and its
 * own (small) cost, so it gets its own switch. Off means every claim resolves
 * UNRESOLVED and reaches a human — the behaviour the first smoke test ran under.
 */
export const ENGINE_EVIDENCE_RETRIEVAL_ENABLED =
  'ENGINE_EVIDENCE_RETRIEVAL_ENABLED';

/** Feature flag. Absent or falsy means the engine is off. */
export const CONTENT_ENGINE_ENABLED = 'CONTENT_ENGINE_ENABLED';

/**
 * Money is integer **micros of SAR** everywhere — 1 SAR = 1_000_000 micros.
 *
 * Floats are not allowed near a spending cap. `0.1 + 0.2 !== 0.3` is a rounding
 * curiosity in a report and a budget breach in a ledger, and Mongo's `$inc`
 * on a double compounds it across every concurrent reservation.
 */
export const MICROS_PER_SAR = 1_000_000;

export const sarToMicros = (sar: number): number =>
  Math.ceil(sar * MICROS_PER_SAR);
export const microsToSar = (micros: number): number => micros / MICROS_PER_SAR;

/** Default monthly cap (roadmap §30.2). Overridable by configuration. */
export const DEFAULT_MONTHLY_CAP_SAR = 100;

/** A single batch may never consume the whole month by default. */
export const DEFAULT_BATCH_CAP_SAR = 25;

/**
 * Job states.
 *
 * `cancelled` and `failed` are terminal; `completed` is terminal. Everything
 * else is resumable, which is what makes crash recovery a re-lease rather than
 * a restart.
 */
export const ENGINE_JOB_STATUSES = [
  'queued',
  'leased',
  'awaiting_review',
  'completed',
  'failed',
  'cancelled',
] as const;
export type EngineJobStatus = (typeof ENGINE_JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: readonly EngineJobStatus[] = [
  'awaiting_review',
  'completed',
  'failed',
  'cancelled',
];

export const isTerminal = (status: EngineJobStatus): boolean =>
  TERMINAL_JOB_STATUSES.includes(status);

/** How long a worker may hold a job before another may steal the lease. */
export const DEFAULT_LEASE_MS = 5 * 60_000;

/**
 * Hard retry ceiling. Every attempt reserves budget again, so an unbounded
 * retry loop is an unbounded bill — the cap and this number are one safety
 * mechanism, not two.
 */
export const MAX_JOB_ATTEMPTS = 3;

/** Durable checkpoints for the Phase 1 pipeline. */
export const ENGINE_PIPELINE_STAGES = [
  'pending',
  'context_resolved',
  'generated',
  'screened',
  'verified',
  'compatibility_checked',
  'judged',
  'awaiting_review',
  'provider_outcome_ambiguous',
] as const;
export type EnginePipelineStage = (typeof ENGINE_PIPELINE_STAGES)[number];

/** Ledger entry lifecycle. */
export const COST_ENTRY_STATUSES = [
  'reserved',
  'reconciled',
  'released',
  'orphaned',
] as const;
export type CostEntryStatus = (typeof COST_ENTRY_STATUSES)[number];

/**
 * Why a call's usage is what the ledger says it is.
 *
 * `unknown-timeout` is the honest one: the provider may or may not have billed
 * us, and nothing observable settles it. See `EngineBudgetService` for how that
 * is accounted.
 */
export const USAGE_SOURCES = [
  'reported',
  'estimated',
  'unknown-timeout',
  /**
   * The provider refused the request before running it — an HTTP error with
   * an error body, not a dropped connection. Nothing was inferred and nothing
   * is billed, so the reservation is released rather than charged. Only an
   * explicit provider rejection may use this; anything ambiguous stays
   * `unknown-timeout`, which charges in full.
   */
  'provider-rejected',
] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export class BudgetExceededError extends Error {
  constructor(
    readonly scope: 'batch' | 'monthly',
    readonly requestedMicros: number,
    readonly availableMicros: number,
  ) {
    super(
      `Content engine ${scope} budget would be exceeded: requested ${requestedMicros} micros, ${availableMicros} available`,
    );
  }
}

export class PricingUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
  ) {
    // Fail closed. A missing price is not "free" — it is "unknown", and
    // spending against an unknown rate is exactly how a cap stops meaning
    // anything.
    super(
      `No configured pricing for ${provider}/${model}; refusing to reserve budget`,
    );
  }
}

export class EngineDisabledError extends Error {
  constructor() {
    super(`${CONTENT_ENGINE_ENABLED} is not enabled`);
  }
}

export class LeaseLostError extends Error {
  constructor(
    readonly jobId: string,
    readonly epoch: number,
  ) {
    super(`Lease epoch ${epoch} is no longer current for job ${jobId}`);
  }
}

/** A provider call may have been billed, so retrying it automatically is unsafe. */
export class AmbiguousProviderOutcomeError extends Error {
  constructor(
    readonly stage: string,
    readonly causeMessage: string,
  ) {
    super(`Ambiguous provider outcome during ${stage}: ${causeMessage}`);
  }
}
