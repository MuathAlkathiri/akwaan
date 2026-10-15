import {
  MOVING_XO_DECISIVE_AFTER_MOVES,
  MovingXoBoard,
  applyPlacement,
  createMovingXoBoard,
  expiringCellFor,
  isBoardFull,
  legalTargetsFor,
  marksOf,
  placementIssue,
  resolveAfterMove,
  winnerOf,
} from './moving-xo-board';

const X = 'team-x';
const O = 'team-o';

/** Deterministic fixtures: a board is described by the moves that built it. */
function board(
  moves: ReadonlyArray<[team: string, cell: number]>,
  decisive = false,
): MovingXoBoard {
  return moves.reduce(
    (current, [team, cell]) => applyPlacement(current, team, cell, decisive),
    createMovingXoBoard([X, O]),
  );
}

describe('Moving XO board — placement legality', () => {
  it('allows any empty cell on an empty board', () => {
    expect(legalTargetsFor(createMovingXoBoard([X, O]), X, false)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('allows only empty cells while a team holds one or two marks', () => {
    const one = board([[X, 0]]);
    expect(legalTargetsFor(one, X, false)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(expiringCellFor(one, X, false)).toBeNull();

    const two = board([
      [X, 0],
      [X, 1],
    ]);
    expect(legalTargetsFor(two, X, false)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(expiringCellFor(two, X, false)).toBeNull();
  });

  it('names the oldest mark as expiring once a team holds three', () => {
    const three = board([
      [X, 0],
      [X, 1],
      [X, 2],
    ]);
    expect(expiringCellFor(three, X, false)).toBe(0);
    // Empty cells, plus the expiring cell itself — and nothing else.
    expect(legalTargetsFor(three, X, false)).toEqual([0, 3, 4, 5, 6, 7, 8]);
  });

  it('refuses an opponent cell', () => {
    expect(placementIssue(board([[O, 4]]), X, 4, false)).toBe(
      'cell-occupied-by-opponent',
    );
  });

  it('refuses the team own non-expiring marks', () => {
    const three = board([
      [X, 0],
      [X, 1],
      [X, 2],
    ]);
    expect(placementIssue(three, X, 1, false)).toBe(
      'cell-not-the-expiring-mark',
    );
    expect(placementIssue(three, X, 2, false)).toBe(
      'cell-not-the-expiring-mark',
    );
  });

  it('refuses an own cell when nothing is expiring yet', () => {
    expect(placementIssue(board([[X, 0]]), X, 0, false)).toBe(
      'cell-occupied-by-own-live-mark',
    );
  });

  it.each([-1, 9, 1.5, Number.NaN])('refuses the invalid cell %p', (cell) => {
    expect(
      placementIssue(createMovingXoBoard([X, O]), X, cell as number, false),
    ).toBe('cell-out-of-range');
  });

  it('throws rather than silently applying an illegal placement', () => {
    expect(() => applyPlacement(board([[O, 4]]), X, 4, false)).toThrow(
      /Illegal Moving XO placement/,
    );
  });
});

describe('Moving XO board — FIFO', () => {
  it('records marks oldest to newest', () => {
    const three = board([
      [X, 0],
      [X, 4],
      [X, 8],
    ]);
    expect(marksOf(three, X)).toEqual([0, 4, 8]);
  });

  it('evicts the oldest when a fourth mark lands on an empty cell', () => {
    const fourth = board([
      [X, 0],
      [X, 4],
      [X, 8],
      [X, 2],
    ]);
    expect(fourth.cells[0]).toBeNull();
    expect(marksOf(fourth, X)).toEqual([4, 8, 2]);
    expect(marksOf(fourth, X)).toHaveLength(3);
  });

  it('keeps each team FIFO independent', () => {
    const mixed = board([
      [X, 0],
      [O, 1],
      [X, 3],
      [O, 4],
      [X, 6],
      [O, 7],
      [X, 2], // evicts X's cell 0 only
    ]);
    expect(marksOf(mixed, X)).toEqual([3, 6, 2]);
    expect(marksOf(mixed, O)).toEqual([1, 4, 7]);
    expect(mixed.cells[0]).toBeNull();
    expect(mixed.cells[1]).toBe(O);
  });
});

describe('Moving XO board — same-cell refresh', () => {
  const three = board([
    [X, 0],
    [X, 4],
    [X, 8],
  ]);

  it('is legal on the expiring cell', () => {
    expect(placementIssue(three, X, 0, false)).toBeUndefined();
  });

  it('leaves board occupancy identical', () => {
    const refreshed = applyPlacement(three, X, 0, false);
    expect(refreshed.cells).toEqual(three.cells);
    expect(marksOf(refreshed, X)).toHaveLength(3);
  });

  it('moves the refreshed cell to newest', () => {
    const refreshed = applyPlacement(three, X, 0, false);
    expect(marksOf(refreshed, X)).toEqual([4, 8, 0]);
    // The expiring mark is now a different cell, which is the whole point.
    expect(expiringCellFor(refreshed, X, false)).toBe(4);
  });

  it('never exposes an empty intermediate cell', () => {
    // One transition: the refreshed cell is owned before and after, so no
    // observer of committed state can see it vacant.
    const refreshed = applyPlacement(three, X, 0, false);
    expect(three.cells[0]).toBe(X);
    expect(refreshed.cells[0]).toBe(X);
  });
});

describe('Moving XO board — win detection', () => {
  it.each([
    ['row', [0, 1, 2]],
    ['row', [3, 4, 5]],
    ['row', [6, 7, 8]],
    ['column', [0, 3, 6]],
    ['column', [1, 4, 7]],
    ['column', [2, 5, 8]],
    ['diagonal', [0, 4, 8]],
    ['diagonal', [2, 4, 6]],
  ])('detects a %s win on %p', (_kind, line) => {
    const cells = line as number[];
    expect(
      winnerOf(board(cells.map((cell) => [X, cell] as [string, number]))),
    ).toBe(X);
  });

  it('finds no winner on an empty or partial board', () => {
    expect(winnerOf(createMovingXoBoard([X, O]))).toBeNull();
    expect(
      winnerOf(
        board([
          [X, 0],
          [O, 1],
          [X, 2],
        ]),
      ),
    ).toBeNull();
  });

  it('reads live marks only — an evicted mark cannot win', () => {
    // X occupies the top row, then a fourth placement evicts cell 0. The row is
    // no longer live, so it must not register as a win.
    const evicted = board([
      [X, 0],
      [X, 1],
      [X, 2],
      [X, 4],
    ]);
    expect(evicted.cells[0]).toBeNull();
    expect(winnerOf(evicted)).toBeNull();
  });

  it('counts a refreshed mark as live', () => {
    const refreshed = board([
      [X, 0],
      [X, 1],
      [X, 2],
      [X, 0], // refresh the oldest in place — the row survives
    ]);
    expect(winnerOf(refreshed)).toBe(X);
  });
});

describe('Moving XO board — decisive phase (الحسم)', () => {
  it('does not transition before the threshold', () => {
    const result = resolveAfterMove(
      board([[X, 0]]),
      MOVING_XO_DECISIVE_AFTER_MOVES - 1,
      false,
    );
    expect(result).toEqual({ kind: 'continue', decisivePhase: false });
  });

  it('transitions on a non-winning move #12', () => {
    const result = resolveAfterMove(
      board([[X, 0]]),
      MOVING_XO_DECISIVE_AFTER_MOVES,
      false,
    );
    expect(result).toEqual({ kind: 'continue', decisivePhase: true });
  });

  it('resolves a winning move #12 as a win and never enters الحسم', () => {
    const won = board([
      [X, 0],
      [X, 1],
      [X, 2],
    ]);
    expect(
      resolveAfterMove(won, MOVING_XO_DECISIVE_AFTER_MOVES, false),
    ).toEqual({ kind: 'win', winningTeamId: X });
  });

  it('stops expiry: nothing is expiring and own cells become illegal', () => {
    const three = board([
      [X, 0],
      [X, 4],
      [X, 8],
    ]);
    expect(expiringCellFor(three, X, true)).toBeNull();
    expect(placementIssue(three, X, 0, true)).toBe(
      'cell-occupied-by-own-live-mark',
    );
    expect(legalTargetsFor(three, X, true)).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it('lets a team exceed three marks', () => {
    let current = board([
      [X, 0],
      [X, 4],
      [X, 8],
    ]);
    current = applyPlacement(current, X, 1, true);
    expect(marksOf(current, X)).toEqual([0, 4, 8, 1]);
    expect(current.cells.filter((owner) => owner === X)).toHaveLength(4);
    // Nothing was evicted.
    expect(current.cells[0]).toBe(X);
  });
});

describe('Moving XO board — terminal resolution', () => {
  /** X: 0,1,5,6,7 · O: 2,3,4,8 — full, with no line for either team. */
  const fullNoWinner = board(
    [
      [X, 0],
      [X, 1],
      [O, 2],
      [O, 3],
      [O, 4],
      [X, 5],
      [X, 6],
      [X, 7],
      [O, 8],
    ],
    true,
  );

  it('builds a genuinely full board with no winner', () => {
    expect(isBoardFull(fullNoWinner)).toBe(true);
    expect(winnerOf(fullNoWinner)).toBeNull();
  });

  it('resolves a draw when الحسم fills the board with no winner', () => {
    expect(resolveAfterMove(fullNoWinner, 20, true)).toEqual({ kind: 'draw' });
  });

  it('prefers a winner over a draw when the final cell completes a line', () => {
    // O holds 2,4,6 — a diagonal — on an otherwise full board.
    const fullWithWinner = board(
      [
        [X, 0],
        [X, 1],
        [O, 2],
        [X, 3],
        [O, 4],
        [X, 5],
        [O, 6],
        [X, 7],
        [X, 8],
      ],
      true,
    );
    expect(isBoardFull(fullWithWinner)).toBe(true);
    expect(resolveAfterMove(fullWithWinner, 20, true)).toEqual({
      kind: 'win',
      winningTeamId: O,
    });
  });

  it('does not draw on a full board outside الحسم', () => {
    // Unreachable in normal play (FIFO caps the board at six marks) but the
    // ordering must still be explicit rather than incidental.
    expect(resolveAfterMove(fullNoWinner, 5, false)).toEqual({
      kind: 'continue',
      decisivePhase: false,
    });
  });
});
