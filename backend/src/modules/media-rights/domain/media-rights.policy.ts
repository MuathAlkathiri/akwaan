/**
 * Rights evidence for real-person media — informational, not a gate.
 *
 * Akwaan records two independent things about an asset: `assetRights` (the right
 * to use the image) and `likenessUseBasis` (a basis for using an identifiable
 * person's likeness commercially). They are tracked separately because they are
 * genuinely separate questions and a free copyright licence answers only the
 * first.
 *
 * **Neither is a readiness gate.** A Product decision on 2026-10-04 reversed an
 * earlier policy that blocked release on clearance: nothing in authoring,
 * promotion, World activation or Production consults these statuses. They exist
 * so that what is known — and what is not — is written down honestly.
 *
 * `productionReady` below is therefore *advisory*: it answers "is this asset
 * evidenced as clear on both counts", not "may this ship". Nothing reads it to
 * decide whether content may be promoted.
 *
 * Layer 2 is deliberately not hard-coded to "signed personal permission". What
 * is acceptable varies by market, provider and contract, so a record states
 * *which* basis applies rather than asserting one universal mechanism.
 *
 * This file is the single place the derivation lives, so an expired grant cannot
 * quietly keep reading as cleared in one caller and not another.
 */

/** What is stored. `EXPIRED` is deliberately absent — see `effectiveStatus`. */
export const CLEARANCE_STATUSES = [
  'UNKNOWN',
  'PENDING',
  'CLEARED',
  'BLOCKED',
] as const;
export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

/**
 * What is read. `EXPIRED` exists only here.
 *
 * Expiry is computed on read rather than written by a job: a stored flag is
 * wrong for the whole window between the grant lapsing and something happening
 * to run, and that window is exactly when a release would go out.
 */
export type EffectiveStatus = ClearanceStatus | 'EXPIRED';

/** Layer 1 — the right to use the image itself. */
export const ASSET_RIGHTS_BASES = [
  'cc',
  'public-domain',
  'owned',
  'commercial-licence',
  'grant',
  'commissioned',
  'other',
] as const;
export type AssetRightsBasis = (typeof ASSET_RIGHTS_BASES)[number];

/** Layer 2 — the basis for commercial use of an identifiable person's likeness. */
export const LIKENESS_USE_BASES = [
  'provider-release',
  'direct-grant',
  'management-grant',
  'broadcaster-grant',
  'contract',
  'commissioned-release',
  'other',
] as const;
export type LikenessUseBasis = (typeof LIKENESS_USE_BASES)[number];

export interface ClearanceLayer {
  status: ClearanceStatus;
  expiresAt?: Date | null;
}

/**
 * The stored status, except that a `CLEARED` layer whose expiry has passed reads
 * as `EXPIRED`.
 *
 * Only `CLEARED` can expire. A `PENDING` layer with a stale date is still
 * `PENDING` — it never conferred anything that could lapse.
 */
export function effectiveStatus(
  layer: ClearanceLayer | undefined,
  now: Date,
): EffectiveStatus {
  if (!layer) return 'UNKNOWN';
  if (layer.status !== 'CLEARED') return layer.status;
  if (layer.expiresAt && layer.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'CLEARED';
}

export interface ClearanceView {
  assetRights: EffectiveStatus;
  likenessUseBasis: EffectiveStatus;
  productionReady: boolean;
}

/**
 * Both layers, and whether both are evidenced as clear.
 *
 * Advisory only — no caller gates on this. It is derived on every read and never
 * stored, because a stored copy would say `true` while a date in the same row
 * said otherwise.
 */
export function clearanceView(
  record:
    | { assetRights?: ClearanceLayer; likenessUseBasis?: ClearanceLayer }
    | null
    | undefined,
  now: Date,
): ClearanceView {
  const assetRights = effectiveStatus(record?.assetRights, now);
  const likenessUseBasis = effectiveStatus(record?.likenessUseBasis, now);
  return {
    assetRights,
    likenessUseBasis,
    productionReady:
      assetRights === 'CLEARED' && likenessUseBasis === 'CLEARED',
  };
}

/**
 * Whether a licence makes attribution deterministic.
 *
 * Only where the basis itself settles it. Every Creative Commons licence in use
 * carries BY, so attribution is required; public domain requires none. A custom
 * grant or a commercial licence is whatever its evidence says, so this returns
 * `undefined` and the record must state the requirement rather than have one
 * guessed for it.
 *
 * This exists because two hand-maintained authoring ledgers already disagreed
 * about one asset — the same file recorded as public domain *and* as requiring
 * attribution. A derivation cannot drift that way.
 */
export function attributionRequiredFor(
  basis: AssetRightsBasis | undefined,
  licence: string | undefined,
): boolean | undefined {
  if (basis === 'public-domain') return false;
  if (basis === 'cc') {
    const text = (licence ?? '').toLowerCase();
    if (text.includes('cc0')) return false;
    if (text.includes('cc by') || text.includes('cc-by')) return true;
    return undefined;
  }
  return undefined;
}
