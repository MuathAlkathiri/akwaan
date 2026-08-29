export const RAKKIBHA_MODE_KEY = "rakkibha";
export const RAKKIBHA_CHALLENGE_NAME = "ركّبها";
export const RAKKIBHA_PUZZLE_COUNT = 3;

export interface RakkibhaMedia {
  type: "image" | "audio" | "video";
  url: string;
  altText?: string;
}
export interface RakkibhaReference {
  content?: string;
  media: RakkibhaMedia;
}
export interface RakkibhaCandidate {
  localId: string;
  content?: string;
  media: RakkibhaMedia;
}
export interface RakkibhaCandidateView {
  id: string;
  content?: string;
  candidates: RakkibhaCandidate[];
}
export interface RakkibhaProgress {
  teamId: string;
  solved: number;
  wrongAttempts: number;
  locked: number;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
export const parseRakkibhaReference = (value: unknown) =>
  parseJson<RakkibhaReference | null>(value, null);
export const parseRakkibhaCandidates = (value: unknown) =>
  parseJson<RakkibhaCandidateView | null>(value, null);
export const parseRakkibhaProgress = (value: unknown) =>
  parseJson<RakkibhaProgress[]>(value, []);
export function remainingLockSeconds(
  lockUntil: unknown,
  nowMs: number,
): number {
  const until = Number(lockUntil ?? 0);
  return Number.isFinite(until)
    ? Math.max(0, Math.ceil((until - nowMs) / 1000))
    : 0;
}
export function remainingRaceSeconds(
  deadlineAt: unknown,
  nowMs: number,
): number {
  const parsed =
    typeof deadlineAt === "string" ? Date.parse(deadlineAt) : Number.NaN;
  return Number.isNaN(parsed)
    ? 0
    : Math.max(0, Math.ceil((parsed - nowMs) / 1000));
}
export type RakkibhaTeamStatus = "solving" | "locked" | "finished";
export function teamStatus(
  entry: RakkibhaProgress,
  nowMs: number,
  puzzleCount = RAKKIBHA_PUZZLE_COUNT,
): RakkibhaTeamStatus {
  if (entry.solved >= puzzleCount) return "finished";
  return entry.locked > nowMs ? "locked" : "solving";
}
export const RAKKIBHA_STATUS_LABEL: Record<RakkibhaTeamStatus, string> = {
  solving: "يركّب",
  locked: "مقفل مؤقتًا",
  finished: "أنهى التحدي",
};
const ERROR_COPY: Record<string, string> = {
  RAKKIBHA_REFERENCE_CANNOT_SUBMIT: "حامل الشكل المرجعي لا يرسل إجابة.",
  RAKKIBHA_CANDIDATE_NOT_ASSIGNED: "هذه القطعة ليست ضمن خياراتك.",
  RAKKIBHA_TEAM_LOCKED: "فريقك مقفل لثوانٍ بعد اختيار غير صحيح.",
  RAKKIBHA_STALE_PUZZLE: "انتقل فريقك إلى لغز آخر.",
  RAKKIBHA_DEADLINE_PASSED: "انتهى وقت التحدي.",
  CONNECTION_LOST: "انقطع الاتصال. جارٍ إعادة المزامنة.",
};
export function describeRakkibhaError(error: unknown): string {
  const code =
    typeof error === "string"
      ? error
      : ((error as { code?: string } | null)?.code ?? "");
  return (
    ERROR_COPY[code] ??
    (typeof error === "object" && error && "message" in error
      ? String((error as { message?: string }).message)
      : "ما ضبط. جرّب مرة ثانية.")
  );
}
