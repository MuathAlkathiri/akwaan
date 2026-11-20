export const FIRST_NOTE_MODE_KEY = "first-note";
export const FIRST_NOTE_NAME = "من أول نغمة";
/** Mirrors the server's floor on an opening bid; the server is the authority. */
export const FIRST_NOTE_OPENING_MIN_BID = 8;
const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
export interface FirstNoteView {
  phase:
    "preparing" | "auction" | "answering" | "steal" | "resolved" | "completed";
  songIndex: number;
  songCount: number;
  clue: { ar: string };
  clueLabel?: { ar: string };
  currentBidSeconds?: number;
  currentBidTeamId?: string;
  biddingTeamId?: string;
  answerOwnerTeamId?: string;
  finalBidSeconds?: number;
  /** During a steal, the clip length the stealing team earned with its own bid. */
  stealSeconds?: number;
  deadlineAt?: string;
  canBid: boolean;
  canPass: boolean;
  canAnswer: boolean;
  audio?: { type: string; assets: Array<{ url: string; altText?: string }> };
  reveal?: {
    answers?: Record<string, string | null>;
    resolvedAt?: string;
    title: string;
    finalBidSeconds: number;
    auctionTeamId: string;
    winnerTeamId: string | null;
    stolen: boolean;
    points: Record<string, number>;
  };
  result?: {
    winnerTeamId: string | null;
    tie: boolean;
    points: Record<string, number>;
  };
}
export function readFirstNoteView(
  state: Record<string, string | number | boolean | null>,
): FirstNoteView {
  return {
    phase: String(state.phase ?? "preparing") as FirstNoteView["phase"],
    songIndex: Number(state.currentSongIndex ?? 0),
    songCount: Number(state.songCount ?? 3),
    clue: json(state.contextualClueJson, { ar: "" }),
    clueLabel: json(state.clueLabelJson, undefined),
    ...(typeof state.stealSeconds === "number"
      ? { stealSeconds: state.stealSeconds }
      : {}),
    ...(typeof state.currentBidSeconds === "number"
      ? { currentBidSeconds: state.currentBidSeconds }
      : {}),
    ...(typeof state.currentBidTeamId === "string"
      ? { currentBidTeamId: state.currentBidTeamId }
      : {}),
    ...(typeof state.biddingTeamId === "string"
      ? { biddingTeamId: state.biddingTeamId }
      : {}),
    ...(typeof state.answerOwnerTeamId === "string"
      ? { answerOwnerTeamId: state.answerOwnerTeamId }
      : {}),
    ...(typeof state.finalBidSeconds === "number"
      ? { finalBidSeconds: state.finalBidSeconds }
      : {}),
    ...(typeof state.deadlineAt === "string"
      ? { deadlineAt: state.deadlineAt }
      : {}),
    canBid: state.canBid === true,
    canPass: state.canPass === true,
    canAnswer: state.canAnswer === true,
    ...(state.audioJson ? { audio: json(state.audioJson, undefined) } : {}),
    ...(state.revealJson ? { reveal: json(state.revealJson, undefined) } : {}),
    ...(state.resultJson ? { result: json(state.resultJson, undefined) } : {}),
  };
}
