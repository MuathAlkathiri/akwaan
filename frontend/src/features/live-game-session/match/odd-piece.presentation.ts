export const ODD_PIECE_MODE_KEY = "odd-piece";
export const ODD_PIECE_CHALLENGE_NAME = "القطعة الدخيلة";

export interface OddPieceView {
  phase: "preparing" | "open" | "selecting" | "revealed" | "completed";
  puzzleIndex: number;
  puzzleCount: number;
  prompt: string;
  pieces: Array<{ id: string; imageUrl: string; altText?: string }>;
  answerOwnerTeamId?: string;
  failedTeamIds: string[];
  canClaim: boolean;
  canSelect: boolean;
  attemptUsed: boolean;
  deadlineAt?: string;
  reveal?: {
    oddPieceId: string;
    targetVehicleLabel: string;
    intruderVehicleLabel: string;
    targetReveal: { imageUrl: string; altText?: string };
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

export function readOddPieceView(
  state: Record<string, string | number | boolean | null>,
): OddPieceView {
  return {
    phase: String(state.phase ?? "preparing") as OddPieceView["phase"],
    puzzleIndex: Number(state.currentPuzzleIndex ?? 0),
    puzzleCount: Number(state.puzzleCount ?? 3),
    prompt: String(state.prompt ?? "اختر القطعة الدخيلة"),
    pieces: json<OddPieceView["pieces"]>(state.piecesJson, []),
    ...(typeof state.answerOwnerTeamId === "string"
      ? { answerOwnerTeamId: state.answerOwnerTeamId }
      : {}),
    failedTeamIds: json<string[]>(state.failedTeamIdsJson, []),
    canClaim: state.canClaim === true,
    canSelect: state.canSelect === true,
    attemptUsed: state.attemptUsed === true,
    ...(typeof state.deadlineAt === "string"
      ? { deadlineAt: state.deadlineAt }
      : {}),
    ...(state.revealJson
      ? { reveal: json<OddPieceView["reveal"]>(state.revealJson, undefined) }
      : {}),
    ...(state.resultJson
      ? { result: json<OddPieceView["result"]>(state.resultJson, undefined) }
      : {}),
  };
}
