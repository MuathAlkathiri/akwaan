import { MOVING_XO_SLUG } from '../../world-content/domain/world-content.constants';

/**
 * "Moving XO" — the 3×3 board and the rules that move marks on it.
 *
 * Pure and deterministic. Nothing here knows about Mongo, sockets, content,
 * timers or actors: the plugin owns the runtime, and this owns the question
 * "given this board, is that placement legal, and what does the board become?".
 * Keeping it separable is what lets the whole rule set — FIFO, refresh, the
 * decisive phase, the draw — be exercised without a runtime at all.
 *
 * Board ownership is keyed by **canonical team id**, never by "X" or "O". X and O
 * are presentation identity chosen by the surface that renders the board; the
 * authoritative record is which team owns which cell, so a relabelled or
 * reordered presentation can never change who won.
 *
 * Product contract: roadmap §23.11.
 */

export const MOVING_XO_MODE_KEY = MOVING_XO_SLUG;

/** 3×3. Cells are indexed 0..8, row-major. */
export const MOVING_XO_CELL_COUNT = 9;

/** Live marks a team may hold before the oldest starts expiring. */
export const MOVING_XO_MAX_LIVE_MARKS = 3;

/**
 * Successful board moves, across both teams, after which a non-winning board
 * enters الحسم.
 *
 * Declared once. §23.11 calls 12 a configurable playtest value rather than
 * locked balance, so rebalancing has to mean editing this line and nothing else
 * — a threshold repeated across files is one that silently stops being tunable.
 */
export const MOVING_XO_DECISIVE_AFTER_MOVES = 12;

/** The eight lines that win. */
export const MOVING_XO_WINNING_LINES: readonly (readonly [
  number,
  number,
  number,
])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/**
 * Who owns each cell, and in what order each team earned its marks.
 *
 * `markOrder` is the authoritative FIFO per team, oldest first, and holds cell
 * indices. It is kept in الحسم too: expiry stops, but the order still describes
 * how the board was built, which is what a reconnecting client needs to render
 * history faithfully.
 */
export interface MovingXoBoard {
  readonly cells: readonly (string | null)[];
  readonly markOrder: Readonly<Record<string, readonly number[]>>;
}

export type MovingXoPlacementIssue =
  | 'cell-out-of-range'
  | 'cell-occupied-by-opponent'
  | 'cell-occupied-by-own-live-mark'
  | 'cell-not-the-expiring-mark';

export function createMovingXoBoard(teamIds: readonly string[]): MovingXoBoard {
  return {
    cells: Array.from({ length: MOVING_XO_CELL_COUNT }, () => null),
    markOrder: Object.fromEntries(teamIds.map((teamId) => [teamId, []])),
  };
}

export function marksOf(
  board: MovingXoBoard,
  teamId: string,
): readonly number[] {
  return board.markOrder[teamId] ?? [];
}

/**
 * The cell that would expire if this team placed now, or `null`.
 *
 * `null` in الحسم by design: once expiry stops there is no expiring mark, which
 * is also what makes the team's own cells illegal targets again.
 */
export function expiringCellFor(
  board: MovingXoBoard,
  teamId: string,
  decisivePhase: boolean,
): number | null {
  if (decisivePhase) return null;
  const marks = marksOf(board, teamId);
  return marks.length >= MOVING_XO_MAX_LIVE_MARKS ? marks[0] : null;
}

/**
 * Why this placement is illegal, or `undefined` if it is allowed.
 *
 * Returning the reason rather than a boolean so the command layer can answer
 * *why* a placement was refused. The rules, from §23.11: an empty cell is always
 * legal; the team's own expiring cell is legal and refreshes in place; an
 * opponent's cell and the team's own non-expiring cells never are.
 */
export function placementIssue(
  board: MovingXoBoard,
  teamId: string,
  cell: number,
  decisivePhase: boolean,
): MovingXoPlacementIssue | undefined {
  if (!Number.isInteger(cell) || cell < 0 || cell >= MOVING_XO_CELL_COUNT) {
    return 'cell-out-of-range';
  }
  const owner = board.cells[cell];
  if (owner === null) return undefined;
  if (owner !== teamId) return 'cell-occupied-by-opponent';

  const expiring = expiringCellFor(board, teamId, decisivePhase);
  if (expiring === null) return 'cell-occupied-by-own-live-mark';
  return cell === expiring ? undefined : 'cell-not-the-expiring-mark';
}

export function legalTargetsFor(
  board: MovingXoBoard,
  teamId: string,
  decisivePhase: boolean,
): readonly number[] {
  const targets: number[] = [];
  for (let cell = 0; cell < MOVING_XO_CELL_COUNT; cell += 1) {
    if (!placementIssue(board, teamId, cell, decisivePhase)) targets.push(cell);
  }
  return targets;
}

/**
 * The board after a legal placement — **one** transition.
 *
 * A refresh is not modelled as remove-then-add. The cell never becomes empty and
 * no intermediate board is produced: the mark keeps its square and moves to the
 * back of the FIFO. Anything observing committed state sees a single step, which
 * is what stops a reconnect or a projection catching the board mid-move.
 *
 * Eviction and placement are likewise one step: the oldest cell is cleared and
 * the chosen cell written in the same construction.
 *
 * Throws if the placement is illegal — callers check `placementIssue` first.
 */
export function applyPlacement(
  board: MovingXoBoard,
  teamId: string,
  cell: number,
  decisivePhase: boolean,
): MovingXoBoard {
  const issue = placementIssue(board, teamId, cell, decisivePhase);
  if (issue) {
    throw new Error(`Illegal Moving XO placement (${issue}) on cell ${cell}`);
  }

  const marks = marksOf(board, teamId);
  const refreshing = board.cells[cell] === teamId;
  const evicting =
    !refreshing && !decisivePhase && marks.length >= MOVING_XO_MAX_LIVE_MARKS
      ? marks[0]
      : null;

  const cells = [...board.cells];
  if (evicting !== null) cells[evicting] = null;
  cells[cell] = teamId;

  // The cell moves to the back of this team's order whether it was refreshed or
  // newly placed; an evicted cell leaves it entirely.
  const nextOrder = marks.filter(
    (owned) => owned !== cell && owned !== evicting,
  );
  return {
    cells,
    markOrder: { ...board.markOrder, [teamId]: [...nextOrder, cell] },
  };
}

/** The team owning a completed line, or `null`. Reads live cells only. */
export function winnerOf(board: MovingXoBoard): string | null {
  for (const [a, b, c] of MOVING_XO_WINNING_LINES) {
    const owner = board.cells[a];
    if (owner && owner === board.cells[b] && owner === board.cells[c]) {
      return owner;
    }
  }
  return null;
}

export function isBoardFull(board: MovingXoBoard): boolean {
  return board.cells.every((owner) => owner !== null);
}

export type MovingXoResolution =
  | { readonly kind: 'continue'; readonly decisivePhase: boolean }
  | { readonly kind: 'win'; readonly winningTeamId: string }
  | { readonly kind: 'draw' };

/**
 * What a committed move means, in the order §23.11 fixes.
 *
 * Win is checked first and always: a move that completes a line resolves as a
 * win even when it is move twelve, and even when it fills the final cell. Only
 * then does a full board in الحسم become a draw. Reversing these would turn a
 * winning final placement into a tie.
 */
export function resolveAfterMove(
  board: MovingXoBoard,
  successfulMoveCount: number,
  decisivePhase: boolean,
): MovingXoResolution {
  const winningTeamId = winnerOf(board);
  if (winningTeamId) return { kind: 'win', winningTeamId };

  if (decisivePhase && isBoardFull(board)) return { kind: 'draw' };

  // Move #12 with no winner opens الحسم, taking effect before the next turn.
  const nowDecisive =
    decisivePhase || successfulMoveCount >= MOVING_XO_DECISIVE_AFTER_MOVES;
  return { kind: 'continue', decisivePhase: nowDecisive };
}
