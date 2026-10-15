import type { AuthoredText } from "../authored-text";

export const MOVING_XO_MODE_KEY = "moving-xo";

export type MovingXoPhase =
  "question-pending" | "answering" | "placement" | "completed";

export type MovingXoOutcome = "win" | "draw" | "content-exhausted";

export const MOVING_XO_CONTENT_EXHAUSTED_COPY =
  "انتهت الألغاز المتاحة لهذا التحدي، وتنتهي الجولة بدون فائز.";

export interface MovingXoMediaAsset {
  url: string;
  altText?: string;
}

export interface MovingXoMedia {
  type: "none" | "image" | "audio" | "video";
  assets: MovingXoMediaAsset[];
}

export interface MovingXoOption {
  id: string;
  label: AuthoredText;
}

export interface MovingXoQuestionView {
  contentItemId: string;
  scopeId: string;
  answerMode: "match" | "multiple_choice";
  prompt: AuthoredText;
  media?: MovingXoMedia;
  options: MovingXoOption[];
}

export interface MovingXoBoardView {
  cells: Array<string | null>;
  markOrder: Record<string, number[]>;
}

export interface MovingXoView {
  phase: MovingXoPhase;
  activeTeamId: string;
  board: MovingXoBoardView;
  successfulMoveCount: number;
  decisivePhase: boolean;
  pendingMove: boolean;
  deadlineAt?: string;
  outcome?: MovingXoOutcome;
  winningTeamId?: string;
  questionsPresented: number;
  question?: MovingXoQuestionView;
  /** Present only in the active-team placement projection. */
  expiringCell?: number;
  /** Present only in the active-team placement projection. */
  legalCells: number[];
}

const EMPTY_BOARD: MovingXoBoardView = {
  cells: Array.from({ length: 9 }, () => null),
  markOrder: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteCell = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < 9;

function boardOf(value: unknown): MovingXoBoardView {
  if (!isRecord(value) || !Array.isArray(value.cells)) return EMPTY_BOARD;
  const cells = value.cells
    .slice(0, 9)
    .map((owner) => (typeof owner === "string" ? owner : null));
  while (cells.length < 9) cells.push(null);

  const markOrder: Record<string, number[]> = {};
  if (isRecord(value.markOrder)) {
    for (const [teamId, order] of Object.entries(value.markOrder)) {
      if (Array.isArray(order)) markOrder[teamId] = order.filter(finiteCell);
    }
  }
  return { cells, markOrder };
}

function mediaOf(value: unknown): MovingXoMedia | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  if (
    type !== "none" &&
    type !== "image" &&
    type !== "audio" &&
    type !== "video"
  ) {
    return undefined;
  }
  const assets = Array.isArray(value.assets)
    ? value.assets.flatMap((candidate) => {
        if (!isRecord(candidate) || typeof candidate.url !== "string")
          return [];
        return [
          {
            url: candidate.url,
            ...(typeof candidate.altText === "string"
              ? { altText: candidate.altText }
              : {}),
          },
        ];
      })
    : [];
  return { type, assets };
}

function questionOf(value: unknown): MovingXoQuestionView | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.contentItemId !== "string" ||
    typeof value.scopeId !== "string" ||
    (value.answerMode !== "match" && value.answerMode !== "multiple_choice")
  ) {
    return undefined;
  }
  const options = Array.isArray(value.options)
    ? value.options.flatMap((candidate) => {
        if (!isRecord(candidate) || typeof candidate.id !== "string") return [];
        return [{ id: candidate.id, label: candidate.label as AuthoredText }];
      })
    : [];
  const media = mediaOf(value.media);
  return {
    contentItemId: value.contentItemId,
    scopeId: value.scopeId,
    answerMode: value.answerMode,
    prompt: value.prompt as AuthoredText,
    ...(media ? { media } : {}),
    options,
  };
}

/**
 * Read only the actor-safe projection published by the gameplay plugin.
 *
 * In particular this type has no answer-truth fields. The question parser keeps
 * prompt/media/options and drops every other key, so even a malformed payload
 * cannot accidentally become UI state.
 */
export function readMovingXoView(input: Record<string, unknown>): MovingXoView {
  const phase = [
    "question-pending",
    "answering",
    "placement",
    "completed",
  ].includes(String(input.phase))
    ? (String(input.phase) as MovingXoPhase)
    : "question-pending";
  const question = questionOf(input.question);
  const outcome = ["win", "draw", "content-exhausted"].includes(
    String(input.outcome),
  )
    ? (String(input.outcome) as MovingXoOutcome)
    : undefined;
  return {
    phase,
    activeTeamId:
      typeof input.activeTeamId === "string" ? input.activeTeamId : "",
    board: boardOf(input.board),
    successfulMoveCount: Number(input.successfulMoveCount ?? 0),
    decisivePhase: input.decisivePhase === true,
    pendingMove: input.pendingMove === true,
    ...(typeof input.deadlineAt === "string"
      ? { deadlineAt: input.deadlineAt }
      : {}),
    ...(outcome ? { outcome } : {}),
    ...(typeof input.winningTeamId === "string"
      ? { winningTeamId: input.winningTeamId }
      : {}),
    questionsPresented: Number(input.questionsPresented ?? 0),
    ...(question ? { question } : {}),
    ...(finiteCell(input.expiringCell)
      ? { expiringCell: input.expiringCell }
      : {}),
    legalCells: Array.isArray(input.legalCells)
      ? input.legalCells.filter(finiteCell)
      : [],
  };
}

/** X/O is presentation identity derived from canonical team ordering. */
export function movingXoSymbol(
  teamId: string | null | undefined,
  teams: ReadonlyArray<{ id: string }>,
): "X" | "O" | undefined {
  const index = teams.findIndex((team) => team.id === teamId);
  if (index < 0) return undefined;
  return index % 2 === 0 ? "X" : "O";
}

/**
 * The active phone receives `expiringCell` directly. The public screen does not
 * need an actionable projection, so it reads the oldest mark from the server's
 * authoritative FIFO only to style that already-public cell.
 */
export function visibleExpiringCell(view: MovingXoView): number | undefined {
  if (view.phase !== "placement" || view.decisivePhase) return undefined;
  if (view.expiringCell !== undefined) return view.expiringCell;
  const oldest = view.board.markOrder[view.activeTeamId]?.[0];
  return view.board.markOrder[view.activeTeamId]?.length >= 3 &&
    finiteCell(oldest)
    ? oldest
    : undefined;
}

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

/** Presentation-only highlight over the final authoritative board. */
export function winningLineOf(board: MovingXoBoardView): readonly number[] {
  return (
    WINNING_LINES.find(([a, b, c]) => {
      const owner = board.cells[a];
      return Boolean(
        owner && owner === board.cells[b] && owner === board.cells[c],
      );
    }) ?? []
  );
}
