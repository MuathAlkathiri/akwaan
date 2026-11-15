/**
 * Which mechanics may judge with typo tolerance, from the server's environment.
 *
 * Off unless a deployment names a mechanic in
 * `ANSWER_MATCHING_TOLERANT_MECHANICS` (comma-separated runtime keys, for
 * example `marhala`). Nothing a client sends can turn it on: a guard carried in
 * a command payload is only ever used when this says so.
 */
export const TOLERANT_MATCHING_ENV = 'ANSWER_MATCHING_TOLERANT_MECHANICS';

export function isTolerantAnswerMatchingEnabled(
  mechanicKey: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[TOLERANT_MATCHING_ENV];
  if (!raw) return false;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(mechanicKey);
}
