/**
 * Reading the "ركّبها" runtime projection.
 *
 * The backend hands each actor a flat map of scalars, with structured parts as
 * JSON text. These helpers are the only place that shape is interpreted, so a
 * panel never parses the protocol itself and never invents a value the server
 * did not send.
 */

export const DISTRIBUTED_INFORMATION_MODE_KEY = "distributed-information";
export const DISTRIBUTED_CHALLENGE_NAME = "ركّبها";
export const DISTRIBUTED_PUZZLE_COUNT = 3;

export interface DistributedSegment {
  id: string;
  content: string;
}

export interface DistributedOption {
  id: string;
  label: string;
}

export interface DistributedProgress {
  teamId: string;
  solved: number;
  wrongAttempts: number;
  /** Epoch ms until which this team is locked, or 0. */
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

export function parseDistributedSegments(value: unknown): DistributedSegment[] {
  return parseJson<DistributedSegment[]>(value, []);
}

export function parseDistributedOptions(value: unknown): DistributedOption[] {
  return parseJson<DistributedOption[]>(value, []);
}

export function parseDistributedProgress(value: unknown): DistributedProgress[] {
  return parseJson<DistributedProgress[]>(value, []);
}

/** Seconds left on a team's five-second lock, derived from the server stamp. */
export function remainingLockSeconds(lockUntil: unknown, nowMs: number): number {
  const until = Number(lockUntil ?? 0);
  if (!Number.isFinite(until) || until <= 0) return 0;
  return Math.max(0, Math.ceil((until - nowMs) / 1000));
}

/** Seconds left in the race, derived from the server deadline. */
export function remainingRaceSeconds(deadlineAt: unknown, nowMs: number): number {
  if (typeof deadlineAt !== "string" || !deadlineAt) return 0;
  const parsed = Date.parse(deadlineAt);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.ceil((parsed - nowMs) / 1000));
}

export type DistributedTeamStatus = "solving" | "locked" | "finished";

export function teamStatus(
  entry: DistributedProgress,
  nowMs: number,
  puzzleCount = DISTRIBUTED_PUZZLE_COUNT,
): DistributedTeamStatus {
  if (entry.solved >= puzzleCount) return "finished";
  return entry.locked > nowMs ? "locked" : "solving";
}

export const DISTRIBUTED_STATUS_LABEL: Record<DistributedTeamStatus, string> = {
  solving: "يحل اللغز",
  locked: "مقفل مؤقتًا",
  finished: "أنهى التحدي",
};

/**
 * Player-facing Arabic for the server's refusals. A backend code is never the
 * primary copy a player reads.
 */
const ERROR_COPY: Record<string, string> = {
  DISTRIBUTED_TEAM_SIZE_UNSUPPORTED:
    "هذا التحدي يحتاج لاعبين أو ثلاثة في كل فريق.",
  DISTRIBUTED_NOT_ANSWERER: "زميلك هو المجيب في هذا اللغز.",
  DISTRIBUTED_TEAM_LOCKED: "فريقك مقفل لثوانٍ بعد إجابة غير صحيحة.",
  DISTRIBUTED_STALE_PUZZLE: "انتقل فريقك إلى لغز آخر. جرّب اللغز الحالي.",
  INVALID_DISTRIBUTED_SUBMISSION: "أرسل إجابة صحيحة الشكل.",
  DISTRIBUTED_DEADLINE_PASSED: "انتهى وقت التحدي.",
  MODE_COMMAND_UNAVAILABLE: "انتهى هذا التحدي.",
  DISTRIBUTED_TEAM_UNKNOWN: "لا تشارك في هذا التحدي.",
  DISTRIBUTED_SUBMITTER_UNKNOWN: "لم نتعرّف على هويتك. أعد الاتصال.",
  INVALID_DISTRIBUTED_STATE: "تعذّر قراءة حالة التحدي. جارٍ إعادة المزامنة.",
  DISTRIBUTED_CONTENT_INVALID: "محتوى هذا التحدي غير مكتمل.",
  DISTRIBUTED_REQUIRES_THREE_ITEMS: "يحتاج التحدي ثلاثة عناصر محتوى.",
  DISTRIBUTED_LAUNCH_FORBIDDEN: "المضيف فقط يبدأ هذا التحدي.",
  CONNECTION_LOST: "انقطع الاتصال. جارٍ إعادة المزامنة.",
};

export function describeDistributedError(error: unknown): string {
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

/**
 * How three segments are split for a team of a given size. Mirrors the server's
 * distribution rules so an authoring preview can show the truth: one segment per
 * player for three, and one approved 2+1 merge for two.
 */
export function previewDistribution(
  teamSize: 2 | 3,
  merge: { firstParticipantSegmentIds: string[]; secondParticipantSegmentIds: string[] },
  segmentIds: string[] = ["A", "B", "C"],
): string[][] {
  if (teamSize === 3) return segmentIds.map((id) => [id]);
  return [
    [...merge.firstParticipantSegmentIds],
    [...merge.secondParticipantSegmentIds],
  ];
}
