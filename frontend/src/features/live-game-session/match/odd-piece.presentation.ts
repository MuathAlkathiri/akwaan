export const ODD_PIECE_MODE_KEY = "odd-piece";
export const ODD_PIECE_CHALLENGE_NAME = "القطعة الدخيلة";

export interface OddPieceHotspotImage {
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  media: { type: "image"; assets: Array<{ url: string }> };
}

export interface OddPieceHotspotView {
  phase: "preparing" | "open" | "answering" | "revealed" | "completed";
  puzzleIndex: number;
  puzzleCount: number;
  prompt: string;
  modifiedImage?: OddPieceHotspotImage;
  answerOwnerTeamId?: string;
  actorTeamId?: string;
  canClaim: boolean;
  canAnswer: boolean;
  attemptUsed: boolean;
  /**
   * Whether this phone holds its team's decision: the captain if the team
   * chose one, otherwise the rotation. True when the server says nothing, as
   * an older Run does: there the whole team may act.
   */
  isAssignedActor: boolean;
  /** Whose phone holds it, for a teammate's read-only screen. */
  assignedParticipantId?: string;
  /** When a teammate may act instead of a holder who has gone quiet. */
  standInAt?: string;
  deadlineAt?: string;
  attempts: Array<{
    teamId: string;
    correct: boolean;
    outcome?: "correct" | "wrong" | "timeout";
  }>;
  reveal?: {
    originalImage: OddPieceHotspotImage;
    targetVehicleLabel: string;
    intruderVehicleLabel: string;
    intruderPartLabel: string;
    hotspot: { polygon: Array<{ x: number; y: number }>; tolerance: number };
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

export function readOddPieceHotspotView(
  state: Record<string, string | number | boolean | null>,
): OddPieceHotspotView {
  return {
    phase: String(state.phase ?? "preparing") as OddPieceHotspotView["phase"],
    puzzleIndex: Number(state.currentPuzzleIndex ?? 0),
    puzzleCount: Number(state.puzzleCount ?? 3),
    prompt: String(state.prompt ?? "وين القطعة الدخيلة؟"),
    ...(state.modifiedImageJson
      ? {
          modifiedImage: json<OddPieceHotspotImage | undefined>(
            state.modifiedImageJson,
            undefined,
          ),
        }
      : {}),
    ...(typeof state.answerOwnerTeamId === "string"
      ? { answerOwnerTeamId: state.answerOwnerTeamId }
      : {}),
    ...(typeof state.actorTeamId === "string"
      ? { actorTeamId: state.actorTeamId }
      : {}),
    canClaim: state.canClaim === true,
    canAnswer: state.canSelect === true,
    attemptUsed: state.attemptUsed === true,
    isAssignedActor: state.isAssignedActor !== false,
    ...(typeof state.assignedParticipantId === "string"
      ? { assignedParticipantId: state.assignedParticipantId }
      : {}),
    ...(typeof state.standInAt === "string"
      ? { standInAt: state.standInAt }
      : {}),
    attempts: json<OddPieceHotspotView["attempts"]>(state.attemptsJson, []),
    ...(typeof state.deadlineAt === "string"
      ? { deadlineAt: state.deadlineAt }
      : {}),
    ...(state.revealJson
      ? {
          reveal: json<OddPieceHotspotView["reveal"]>(
            state.revealJson,
            undefined,
          ),
        }
      : {}),
    ...(state.resultJson
      ? {
          result: json<OddPieceHotspotView["result"]>(
            state.resultJson,
            undefined,
          ),
        }
      : {}),
  };
}
