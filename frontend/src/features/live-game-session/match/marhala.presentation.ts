/**
 * Reading the "المرحلة" runtime projection, and the board it is played on.
 *
 * The server owns the race: the roll, the landing, the tile it resolves to, the
 * winner. This module owns the *presentation* of what the server already decided —
 * where each tile sits on a 4×4 serpentine, which tiles a band could reach, and in
 * what order a committed turn should be replayed for the room.
 *
 * Two rules keep that honest. Nothing here resolves gameplay: a boost's
 * destination is read from the committed turn, never chained or recomputed, and no
 * function here can produce a roll. And nothing here is a second source of truth
 * for state: positions, availability, the selected band, the prompt and the result
 * are read straight off the projection the server sent to *this* actor.
 */

import { authoredText, type AuthoredText } from "../authored-text";

export const MARHALA_MODE_KEY = "marhala";
export const MARHALA_CHALLENGE_NAME = "المرحلة";
export const MARHALA_START_POSITION = 1;
export const MARHALA_FINISH_POSITION = 16;
/** Four rows of four, which is what makes the serpentine a serpentine. */
export const MARHALA_ROW_LENGTH = 4;

export type MarhalaPhase =
  "difficulty-choice" | "question-pending" | "question" | "completed";

export type MarhalaDifficulty = "easy" | "medium" | "hard";

export type MarhalaTileKind = "normal" | "boost" | "trap" | "finish";

/**
 * The approved V4 board, as a presentation contract.
 *
 * The same table the runtime resolves with, mirrored here so the board can *show*
 * which tiles are rewards and which are hazards before anyone commits to a band.
 * It is deliberately never used to resolve a landing — a turn's `tile` and
 * `finalLanding` always come from the server — so a drift between the two can
 * mislabel a tile but can never change where a token actually goes.
 */
export const MARHALA_BOOSTS: Readonly<Record<number, number>> = {
  3: 7,
  5: 7,
  8: 13,
  10: 13,
  12: 16,
  14: 16,
};

export const MARHALA_TRAPS: Readonly<Record<number, number>> = {
  4: 1,
  6: 2,
  9: 7,
  11: 7,
  15: 13,
};

/** Tiles nothing sends a team away from — every boost and trap lands on one. */
export const MARHALA_SAFE_POSITIONS: readonly number[] = [1, 2, 7, 13, 16];

/** The three bands a team may elect, with the movement each can buy. */
export const MARHALA_BANDS: ReadonlyArray<{
  difficulty: MarhalaDifficulty;
  label: string;
  min: number;
  max: number;
}> = [
  { difficulty: "easy", label: "سهل", min: 1, max: 2 },
  { difficulty: "medium", label: "متوسط", min: 2, max: 4 },
  { difficulty: "hard", label: "صعب", min: 4, max: 6 },
];

export const MARHALA_DIFFICULTY_LABEL: Readonly<
  Record<MarhalaDifficulty, string>
> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

export function marhalaTileKind(position: number): MarhalaTileKind {
  if (position >= MARHALA_FINISH_POSITION) return "finish";
  if (MARHALA_BOOSTS[position] !== undefined) return "boost";
  if (MARHALA_TRAPS[position] !== undefined) return "trap";
  return "normal";
}

/** Where a tile sends a team, which for most tiles is nowhere. */
export function marhalaTileDestination(position: number): number {
  if (position >= MARHALA_FINISH_POSITION) return MARHALA_FINISH_POSITION;
  return MARHALA_BOOSTS[position] ?? MARHALA_TRAPS[position] ?? position;
}

export interface MarhalaTile {
  position: number;
  /** 1 at the bottom of the board, 4 at the top. */
  row: number;
  /** 1 on the left, 4 on the right, in the board's own fixed direction. */
  column: number;
  kind: MarhalaTileKind;
  /** The tile this one sends a team to, or the tile itself when it sends none. */
  destination: number;
  safe: boolean;
}

/**
 * Every tile, in path order, with its place on the grid.
 *
 * The single source of board geometry: rendering and animation both read this, so
 * a tile cannot sit in one place on screen and another in the movement path.
 *
 * The path snakes — row 1 left to right, row 2 right to left, and so on — which is
 * what keeps 1 → 16 one continuous line. Because each row reverses, the step
 * across a row end (4 → 5, 8 → 9, 12 → 13) is a move straight up rather than a
 * jump across the board.
 */
export const MARHALA_BOARD: readonly MarhalaTile[] = Array.from(
  { length: MARHALA_FINISH_POSITION },
  (_unused, index) => {
    const position = index + 1;
    const rowIndex = Math.floor(index / MARHALA_ROW_LENGTH);
    const offset = index % MARHALA_ROW_LENGTH;
    return {
      position,
      row: rowIndex + 1,
      column: rowIndex % 2 === 0 ? offset + 1 : MARHALA_ROW_LENGTH - offset,
      kind: marhalaTileKind(position),
      destination: marhalaTileDestination(position),
      safe: MARHALA_SAFE_POSITIONS.includes(position),
    };
  },
);

/** The rows as they are drawn: the finish row first, the start row last. */
export function marhalaBoardRows(): MarhalaTile[][] {
  return [4, 3, 2, 1].map((row) =>
    MARHALA_BOARD.filter((tile) => tile.row === row).sort(
      (left, right) => left.column - right.column,
    ),
  );
}

export function marhalaTileAt(position: number): MarhalaTile | undefined {
  return MARHALA_BOARD.find((tile) => tile.position === position);
}

/**
 * Every base landing a band could produce from here.
 *
 * Presentation only, and deliberately not a prediction: it is the whole *range*
 * the band can roll, so the room can weigh a boost two tiles ahead against a trap
 * three tiles ahead. Which value comes up is the server's, and is unknown until a
 * correct answer resolves.
 *
 * Anything at or beyond the finish is the finish — the board has no tile 17.
 */
export function marhalaPossibleLandings(
  from: number,
  range: { min: number; max: number },
): number[] {
  const landings = new Set<number>();
  for (let movement = range.min; movement <= range.max; movement += 1) {
    landings.add(Math.min(from + movement, MARHALA_FINISH_POSITION));
  }
  return [...landings].sort((left, right) => left - right);
}

/** One resolved turn, exactly as the runtime recorded it. */
export interface MarhalaTurn {
  turnNumber: number;
  teamId: string;
  difficulty: MarhalaDifficulty;
  correct: boolean;
  resolvedBy: "answer" | "timeout";
  movement?: number;
  baseLanding?: number;
  tile?: MarhalaTileKind;
  finalLanding?: number;
  resolvedAt?: string;
}

export interface MarhalaResult {
  winnerTeamId: string | null;
  endedBy: "finish" | "content-exhausted";
  positions: Record<string, number>;
  turnsPlayed: number;
}

/**
 * One step of replaying a committed turn.
 *
 * The backend resolves answer, roll, landing and tile effect atomically, and it
 * should stay that way — so the sequence the room sees is built here, from the
 * committed record, and is pure presentation. No frame can change a position the
 * server did not already commit.
 */
export type MarhalaFrame =
  /** "+4": the roll, before the token moves. */
  | { kind: "reveal"; movement: number; from: number }
  /** One tile of walking, so movement reads as travel rather than teleporting. */
  | { kind: "step"; position: number; index: number; total: number }
  /** The base landing, held briefly before any tile effect fires. */
  | { kind: "base"; position: number; tile: MarhalaTileKind }
  /** The boost or trap reacting, named before the token arrives. */
  | { kind: "effect"; tile: "boost" | "trap"; from: number; to: number }
  /** Where the team actually is now, which the projection already said. */
  | { kind: "settled"; position: number };

/**
 * The replay of one committed turn, from a known starting tile.
 *
 * `from` is required rather than derived: a turn that reaches the finish records
 * its base landing clamped to 16, so subtracting the roll would invent a starting
 * tile. The caller passes the position it was already displaying, and a caller
 * that has none — a fresh mount, a reconnect mid-turn — gets no frames and shows
 * the authoritative position instead.
 */
export function marhalaTurnFrames(
  turn: MarhalaTurn,
  from: number,
): MarhalaFrame[] {
  if (!turn.correct || turn.movement === undefined) return [];
  const base = Math.min(
    turn.baseLanding ?? from + turn.movement,
    MARHALA_FINISH_POSITION,
  );
  const frames: MarhalaFrame[] = [
    { kind: "reveal", movement: turn.movement, from },
  ];
  // One frame per tile walked, capped at the finish: the board has no tile 17,
  // so an overshoot walks to 16 and stops there.
  const walked: number[] = [];
  for (let position = from + 1; position <= base; position += 1) {
    walked.push(position);
  }
  walked.forEach((position, index) =>
    frames.push({
      kind: "step",
      position,
      index: index + 1,
      total: walked.length,
    }),
  );
  const tile = turn.tile ?? "normal";
  frames.push({ kind: "base", position: base, tile });
  const final = Math.min(turn.finalLanding ?? base, MARHALA_FINISH_POSITION);
  // Exactly one effect, from the committed record. A destination that is itself
  // special is never chased: the server already settled where the team ended up.
  if ((tile === "boost" || tile === "trap") && final !== base) {
    frames.push({ kind: "effect", tile, from: base, to: final });
  }
  frames.push({ kind: "settled", position: final });
  return frames;
}

/** The token position each frame is showing, for a player of these frames. */
export function marhalaFramePosition(
  frame: MarhalaFrame,
  fallback: number,
): number {
  switch (frame.kind) {
    case "step":
      return frame.position;
    case "base":
      return frame.position;
    case "effect":
      // The effect is announced while the token still stands on the tile that
      // fired it — the room learns "boost" before the token leaves.
      return frame.from;
    case "settled":
      return frame.position;
    default:
      return fallback;
  }
}

/**
 * The whole projection, read once.
 *
 * A field the server did not send to this actor stays absent rather than becoming
 * a default. In particular there is no helper here that could produce an accepted
 * answer: the projection carries a prompt and never carries answers, so a phone
 * has nothing to leak even if a component asked.
 */
export interface MarhalaMedia {
  type: "none" | "image" | "audio";
  url?: string;
  altText?: string;
}

export interface MarhalaView {
  phase: MarhalaPhase;
  activeTeamId: string;
  teamIds: string[];
  positions: Record<string, number>;
  turnNumber: number;
  availableDifficulties: MarhalaDifficulty[];
  movementRanges: Record<MarhalaDifficulty, { min: number; max: number }>;
  selectedDifficulty?: MarhalaDifficulty;
  possibleLandings: number[];
  deadlineAt?: string;
  lastTurn?: MarhalaTurn;
  result?: MarhalaResult;
  prompt?: AuthoredText;
  media?: MarhalaMedia;
  actorTeamId?: string | null;
  /** The server's word on whether this actor's team is the one playing. */
  isActiveTeam: boolean;
}

const PHASES: readonly MarhalaPhase[] = [
  "difficulty-choice",
  "question-pending",
  "question",
  "completed",
];

const DIFFICULTIES: readonly MarhalaDifficulty[] = ["easy", "medium", "hard"];

const DEFAULT_RANGES: Record<MarhalaDifficulty, { min: number; max: number }> =
  {
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  };

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function difficultyOf(value: unknown): MarhalaDifficulty | undefined {
  return DIFFICULTIES.includes(value as MarhalaDifficulty)
    ? (value as MarhalaDifficulty)
    : undefined;
}

export function readMarhalaView(state: Record<string, unknown>): MarhalaView {
  const phase = PHASES.includes(state.phase as MarhalaPhase)
    ? (state.phase as MarhalaPhase)
    : "difficulty-choice";
  const selectedDifficulty = difficultyOf(state.selectedDifficulty);
  return {
    phase,
    activeTeamId: text(state.activeTeamId) ?? "",
    teamIds: parseJson<string[]>(state.teamIdsJson, []),
    positions: parseJson<Record<string, number>>(state.positionsJson, {}),
    turnNumber:
      typeof state.turnNumber === "number" && state.turnNumber > 0
        ? state.turnNumber
        : 1,
    // Availability is the server's alone: a band missing from this list has no
    // unseen content behind it, and no amount of local counting may add it back.
    availableDifficulties: parseJson<string[]>(
      state.availableDifficultiesJson,
      [],
    ).filter((value): value is MarhalaDifficulty =>
      DIFFICULTIES.includes(value as MarhalaDifficulty),
    ),
    movementRanges: {
      ...DEFAULT_RANGES,
      ...parseJson<Partial<typeof DEFAULT_RANGES>>(
        state.movementRangesJson,
        {},
      ),
    },
    ...(selectedDifficulty ? { selectedDifficulty } : {}),
    possibleLandings: parseJson<number[]>(state.possibleLandingsJson, []),
    ...(text(state.deadlineAt) ? { deadlineAt: text(state.deadlineAt) } : {}),
    ...(text(state.lastTurnJson)
      ? {
          lastTurn: parseJson<MarhalaTurn>(
            state.lastTurnJson,
            undefined as never,
          ),
        }
      : {}),
    ...(text(state.resultJson)
      ? {
          result: parseJson<MarhalaResult>(
            state.resultJson,
            undefined as never,
          ),
        }
      : {}),
    ...(text(state.questionPrompt)
      ? {
          prompt: parseJson<AuthoredText>(
            state.questionPrompt,
            undefined as never,
          ),
        }
      : {}),
    ...(parseMarhalaMedia(state.questionMediaJson)
      ? { media: parseMarhalaMedia(state.questionMediaJson) }
      : {}),
    actorTeamId: text(state.actorTeamId) ?? null,
    isActiveTeam: state.isActiveTeam === true,
  };
}

function parseMarhalaMedia(value: unknown): MarhalaMedia | undefined {
  const raw = parseJson<Partial<MarhalaMedia> | undefined>(value, undefined);
  if (
    raw &&
    (raw.type === "image" || raw.type === "audio") &&
    typeof raw.url === "string" &&
    raw.url.trim().length > 0
  ) {
    return {
      type: raw.type,
      url: raw.url.trim(),
      ...(typeof raw.altText === "string" && raw.altText.trim().length > 0
        ? { altText: raw.altText.trim() }
        : {}),
    };
  }
  return undefined;
}

/** The active question's media, if any. */
export function marhalaMedia(view: MarhalaView): MarhalaMedia | undefined {
  return view.media;
}

/** The prompt, ready to render, or the line shown while the server draws one. */
export function marhalaPromptText(view: MarhalaView): string {
  return authoredText(view.prompt, "جارٍ تجهيز السؤال…");
}

/** Where a team's token stands, defaulting to the start rather than to nothing. */
export function marhalaPositionOf(view: MarhalaView, teamId: string): number {
  const position = view.positions[teamId];
  return typeof position === "number" ? position : MARHALA_START_POSITION;
}

/** Whether a band may be elected right now, per the server's availability. */
export function marhalaBandAvailable(
  view: MarhalaView,
  difficulty: MarhalaDifficulty,
): boolean {
  return view.availableDifficulties.includes(difficulty);
}

/**
 * The three bands with what each could reach from the active team's tile.
 *
 * Every band is listed whether or not it is available, because a band the catalog
 * has run out of is information the room needs — hiding it would look like the
 * mechanic only ever had two.
 */
export function marhalaBandPreviews(view: MarhalaView): Array<{
  difficulty: MarhalaDifficulty;
  label: string;
  range: { min: number; max: number };
  landings: number[];
  tiles: MarhalaTile[];
  available: boolean;
}> {
  const from = marhalaPositionOf(view, view.activeTeamId);
  return MARHALA_BANDS.map((band) => {
    const range = view.movementRanges[band.difficulty] ?? {
      min: band.min,
      max: band.max,
    };
    const landings = marhalaPossibleLandings(from, range);
    return {
      difficulty: band.difficulty,
      label: band.label,
      range,
      landings,
      tiles: landings
        .map((position) => marhalaTileAt(position))
        .filter((tile): tile is MarhalaTile => Boolean(tile)),
      available: marhalaBandAvailable(view, band.difficulty),
    };
  });
}
