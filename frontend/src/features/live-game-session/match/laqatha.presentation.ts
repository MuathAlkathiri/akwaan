export const LAQATHA_MODE_KEY = "laqatha";
export const LAQATHA_CHALLENGE_NAME = "القطها";

export interface LaqathaClueView {
  order: number;
  value: number;
  modality: "text" | "image" | "audio";
  text?: { ar: string; en?: string };
  media?: { type: string; assets: Array<{ url: string; altText?: string }> };
}

export interface LaqathaView {
  phase: "preparing" | "revealing" | "claiming" | "resolved" | "completed";
  questionIndex: number;
  questionCount: number;
  revealedClueCount: number;
  currentReward: number;
  clues: LaqathaClueView[];
  claimOwnerTeamId?: string;
  failedTeamIds: string[];
  deadlineAt?: string;
  canClaim: boolean;
  canSubmit: boolean;
  attemptUsed: boolean;
  reveal?: {
    title: string;
    winnerTeamId: string | null;
    solvedAtClue: number | null;
    points: Record<string, number>;
    failedTeamIds: string[];
    clues: LaqathaClueView[];
  };
  result?: {
    winnerTeamId: string | null;
    tie: boolean;
    points: Record<string, number>;
  };
}

const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export function readLaqathaView(
  state: Record<string, string | number | boolean | null>,
): LaqathaView {
  return {
    phase: String(state.phase ?? "preparing") as LaqathaView["phase"],
    questionIndex: Number(state.currentQuestionIndex ?? 0),
    questionCount: Number(state.questionCount ?? 3),
    revealedClueCount: Number(state.revealedClueCount ?? 1),
    currentReward: Number(state.currentReward ?? 5),
    clues: json<LaqathaClueView[]>(state.cluesJson, []),
    ...(typeof state.claimOwnerTeamId === "string"
      ? { claimOwnerTeamId: state.claimOwnerTeamId }
      : {}),
    failedTeamIds: json<string[]>(state.failedTeamIdsJson, []),
    ...(typeof state.deadlineAt === "string"
      ? { deadlineAt: state.deadlineAt }
      : {}),
    canClaim: state.canClaim === true,
    canSubmit: state.canSubmit === true,
    attemptUsed: state.attemptUsed === true,
    ...(state.revealJson
      ? { reveal: json<LaqathaView["reveal"]>(state.revealJson, undefined) }
      : {}),
    ...(state.resultJson
      ? { result: json<LaqathaView["result"]>(state.resultJson, undefined) }
      : {}),
  };
}
