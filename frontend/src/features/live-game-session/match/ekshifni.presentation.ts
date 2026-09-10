export const EKSHIFNI_MODE_KEY = "ekshifni";
export const EKSHIFNI_CHALLENGE_NAME = "اكشفني";

/**
 * One reveal region, as the server projects it.
 *
 * A hidden region arrives as a number and nothing else — no authoring role, no
 * geometry — so a client physically cannot draw the mask it has not been given.
 * `shape` appears only once the region is uncovered, and only on the shared
 * screen; a phone never receives it at all.
 */
export interface EkshifniRegionView {
  id: string;
  /** The neutral player-facing identity, 1..6. */
  number: number;
  revealed: boolean;
  shape?: { x: number; y: number; width: number; height: number };
}

export interface EkshifniRevealView {
  imageIndex: number;
  identity: string;
  value: number;
  winnerTeamId: string | null;
  resolvedBy: "answer" | "timeout";
  attempts: Array<{ teamId: string; answer: string; correct: boolean }>;
  points: Record<string, number>;
  revealedRegionIds: string[];
  resolvedAt: string;
}

export interface EkshifniView {
  phase: "preparing" | "playing" | "resolved" | "completed";
  imageIndex: number;
  imageCount: number;
  imageNumber: number;
  regionCount: number;
  /** Present on the shared screen from activation onward; never on a phone. */
  media?: { type: string; assets: Array<{ url: string; altText?: string }> };
  prompt?: { ar: string; en?: string };
  regions: EkshifniRegionView[];
  revealedRegionIds: string[];
  currentValue: number;
  /** Who may choose the next region — and only that. */
  initiativeTeamId?: string;
  /** Who is waiting out a wrong answer until the opponent acts. */
  answerPenaltyTeamId?: string;
  selectingTeamId?: string;
  hasInitiative: boolean;
  canReveal: boolean;
  canAnswer: boolean;
  reveal?: EkshifniRevealView;
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

export function readEkshifniView(
  state: Record<string, string | number | boolean | null>,
): EkshifniView {
  return {
    phase: String(state.phase ?? "preparing") as EkshifniView["phase"],
    imageIndex: Number(state.currentImageIndex ?? 0),
    imageCount: Number(state.imageCount ?? 3),
    imageNumber: Number(state.imageNumber ?? 1),
    regionCount: Number(state.regionCount ?? 6),
    ...(state.imageMediaJson
      ? { media: json<EkshifniView["media"]>(state.imageMediaJson, undefined) }
      : {}),
    ...(state.promptJson
      ? { prompt: json<EkshifniView["prompt"]>(state.promptJson, undefined) }
      : {}),
    regions: json<EkshifniRegionView[]>(state.regionsJson, []),
    revealedRegionIds: json<string[]>(state.revealedRegionIdsJson, []),
    currentValue: Number(state.currentValue ?? 5),
    ...(typeof state.initiativeTeamId === "string"
      ? { initiativeTeamId: state.initiativeTeamId }
      : {}),
    ...(typeof state.answerPenaltyTeamId === "string"
      ? { answerPenaltyTeamId: state.answerPenaltyTeamId }
      : {}),
    ...(typeof state.selectingTeamId === "string"
      ? { selectingTeamId: state.selectingTeamId }
      : {}),
    hasInitiative: state.hasInitiative === true,
    canReveal: state.canReveal === true,
    canAnswer: state.canAnswer === true,
    ...(state.revealJson
      ? { reveal: json<EkshifniRevealView>(state.revealJson, undefined!) }
      : {}),
    ...(state.resultJson
      ? { result: json<EkshifniView["result"]>(state.resultJson, undefined) }
      : {}),
  };
}
