import { createBatchIntentId, type EngineJobRequest } from "./api";

/**
 * Same-tab persistence for the Review Studio's batch intent.
 *
 * The intent is what makes a retried Submit the *same* batch on the server, so
 * it must survive a reload of the tab — above all while a Submit's outcome is
 * unknown. sessionStorage is per tab: another tab is another batch.
 */
export const BATCH_INTENT_STORAGE_KEY = "akwaan.contentEngine.batchIntent.v1";

/** Mirrors the backend's BATCH_INTENT_ID_PATTERN. */
const INTENT_FORMAT = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

/** A batch request as the form describes it, before the intent is attached. */
export type BatchFormRequest = Omit<EngineJobRequest, "batchIntentId">;

export interface BatchIntentRecord {
  intentId: string;
  /**
   * The exact request a Submit was sent for while its outcome is unconfirmed.
   * While set, the intent belongs to that request only: it is reused for it
   * (retry, reload) and never for a different form. Null once the outcome is
   * known — then the intent is unspent and simply rides with the form.
   */
  pendingRequest: BatchFormRequest | null;
}

export const freshBatchIntent = (): BatchIntentRecord => ({
  intentId: createBatchIntentId(),
  pendingRequest: null,
});

/** Order-independent identity of a form request, for stale-intent checks. */
export const batchFormKey = (request: BatchFormRequest): string =>
  JSON.stringify([
    request.worldKey,
    request.scopeKey,
    request.mechanicKey,
    request.targetCount,
    request.difficulty ?? null,
    request.batchGuidance ?? null,
  ]);

const isFormRequest = (value: unknown): value is BatchFormRequest => {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.worldKey === "string" &&
    typeof r.scopeKey === "string" &&
    typeof r.mechanicKey === "string" &&
    typeof r.targetCount === "number" &&
    Number.isInteger(r.targetCount) &&
    (r.difficulty === undefined || typeof r.difficulty === "string") &&
    (r.batchGuidance === undefined || typeof r.batchGuidance === "string")
  );
};

/** A malformed, foreign or unreadable record is ignored, never trusted. */
export const readBatchIntent = (): BatchIntentRecord | null => {
  try {
    const raw = window.sessionStorage?.getItem(BATCH_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.version !== 1 || typeof parsed.intentId !== "string") {
      return null;
    }
    if (!INTENT_FORMAT.test(parsed.intentId)) return null;
    if (parsed.pendingRequest !== null && !isFormRequest(parsed.pendingRequest)) {
      return null;
    }
    return {
      intentId: parsed.intentId,
      pendingRequest: parsed.pendingRequest as BatchFormRequest | null,
    };
  } catch {
    return null;
  }
};

/** Best effort: without storage the in-memory intent still protects the tab. */
export const writeBatchIntent = (record: BatchIntentRecord): boolean => {
  try {
    window.sessionStorage?.setItem(
      BATCH_INTENT_STORAGE_KEY,
      JSON.stringify({ version: 1, ...record }),
    );
    return true;
  } catch {
    return false;
  }
};
