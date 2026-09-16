export const LA_TAHRIQHA_MODE_KEY = "la-tahriqha";
export const LA_TAHRIQHA_CHALLENGE_NAME = "لا تحرقها";

/**
 * One ingredient card, as the server projects it.
 *
 * A card arrives as an id and a label and nothing else. Whether it belongs in
 * the dish is never projected while the dish is live — not to the shared screen,
 * not to a phone, not to the host — so no client can know the answer before the
 * reveal releases it.
 */
export interface LaTahriqhaCardView {
  localId: string;
  label: string;
}

export interface LaTahriqhaDishView {
  id: string;
  dishName: string;
  dishNote?: string;
  media?: {
    type: "image" | "audio";
    url: string;
    altText?: string;
  } | null;
  ingredients: LaTahriqhaCardView[];
}

/**
 * What one team is showing the room right now.
 *
 * `committedCount` is deliberately null until that team commits: before then the
 * other side may know somebody is still choosing and nothing more. Afterwards
 * the count — three, four or five — is the whole of the pressure, and still
 * names no ingredient.
 */
export interface LaTahriqhaTeamStatus {
  locked: boolean;
  committedCount: number | null;
}

export interface LaTahriqhaTeamDishResult {
  teamId: string;
  selected: string[];
  correctIds: string[];
  wrongIds: string[];
  points: number;
  burned: boolean;
  perfect: boolean;
  understaffed: boolean;
  lockReason: "manual" | "deadline" | "none";
  captainParticipantId: string;
}

export interface LaTahriqhaRevealView {
  dishIndex: number;
  contentItemId: string;
  dishName: string;
  correctIngredientIds: string[];
  teams: LaTahriqhaTeamDishResult[];
  totalsAfter: Record<string, number>;
  resolutionReason: "both-locked" | "deadline";
  resolvedAt: string;
}

export interface LaTahriqhaView {
  phase: "preparing" | "selecting" | "revealed" | "completed";
  dishIndex: number;
  dishCount: number;
  dishNumber: number;
  minSelection: number;
  maxSelection: number;
  dishSeconds: number;
  dish?: LaTahriqhaDishView;
  deadlineAt?: string;
  teamIds: string[];
  teamStatus: Record<string, LaTahriqhaTeamStatus>;
  /** Public on purpose: a team needs to know who to argue with. */
  captainParticipantIds: Record<string, string>;
  /** Internal Signature totals through the dishes already revealed. */
  totals: Record<string, number>;
  /** This actor's own team, and only their own team's live choices. */
  actorTeamId?: string;
  isDishCaptain: boolean;
  ownSelected: string[];
  reveal?: LaTahriqhaRevealView;
  result?: {
    winnerTeamId: string | null;
    tie: boolean;
    totals: Record<string, number>;
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

export function readLaTahriqhaView(
  state: Record<string, string | number | boolean | null>,
): LaTahriqhaView {
  const dishIndex = Number(state.currentDishIndex ?? 0);
  const dish = json<LaTahriqhaDishView | undefined>(
    state.currentDishJson,
    undefined,
  );
  return {
    phase: String(state.phase ?? "preparing") as LaTahriqhaView["phase"],
    dishIndex,
    dishCount: Number(state.dishCount ?? 3),
    dishNumber: dishIndex + 1,
    minSelection: Number(state.minSelection ?? 3),
    maxSelection: Number(state.maxSelection ?? 5),
    dishSeconds: Number(state.dishSeconds ?? 30),
    ...(dish ? { dish } : {}),
    ...(typeof state.deadlineAt === "string"
      ? { deadlineAt: state.deadlineAt }
      : {}),
    teamIds: json<string[]>(state.teamIdsJson, []),
    teamStatus: json<Record<string, LaTahriqhaTeamStatus>>(
      state.teamStatusJson,
      {},
    ),
    captainParticipantIds: json<Record<string, string>>(
      state.captainParticipantIdsJson,
      {},
    ),
    totals: json<Record<string, number>>(state.totalsJson, {}),
    ...(typeof state.actorTeamId === "string"
      ? { actorTeamId: state.actorTeamId }
      : {}),
    isDishCaptain: state.isDishCaptain === true,
    ownSelected: json<string[]>(state.ownSelectedJson, []),
    ...(state.revealJson
      ? {
          reveal: json<LaTahriqhaRevealView | undefined>(
            state.revealJson,
            undefined,
          ),
        }
      : {}),
    ...(state.resultJson
      ? {
          result: json<LaTahriqhaView["result"]>(state.resultJson, undefined),
        }
      : {}),
  };
}
