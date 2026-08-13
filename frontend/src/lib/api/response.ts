const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function normalizeApiData<T>(response: unknown): T {
  let payload = response;
  if (isRecord(payload) && "data" in payload) payload = payload.data;
  if (isRecord(payload) && "data" in payload) payload = payload.data;
  return payload as T;
}
