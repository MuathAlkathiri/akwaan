import {
  ComposedPuzzleDrawing,
  H,
  INK,
  LETTERS,
  NAMED_COLOURS,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  asOptions,
  countOptions,
  frame,
  letterBadge,
  pick,
  round,
  sameReason,
  seededRandom,
  shuffled,
} from './composed-kit';
import {
  DrawnThing,
  drawnThings,
  drawnThingsOf,
  thingSvg,
  toThe,
} from './drawn-things';

/**
 * المسارات والحركة — puzzles of following something through a mechanism:
 * a turn through gears, a way through a maze, a car along one-way roads,
 * a push through dominoes, a current through switches, a length along a rope.
 *
 * Each is built from the fact it then asks about, so the answer is right by
 * construction.
 */
export const PATHS_VARIANTS = {
  'gear-train-direction': [
    'last-direction',
    'same-as-first',
    'count-direction',
  ],
  'maze-exit-route': ['to-which', 'from-which'],
  'shortest-path-grid': ['longest', 'shortest'],
  'domino-cascade-chain': ['last-to-fall', 'count-standing'],
  'one-way-traffic-flow': ['reachable', 'unreachable'],
  'electrical-switch-circuit': ['which-lights', 'which-stays-off'],
} as const;

export type PathsFamily = keyof typeof PATHS_VARIANTS;

const arrowHead = (
  x: number,
  y: number,
  dx: number,
  dy: number,
  size: number,
  colour: string,
): string => {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const point = (along: number, across: number) =>
    `${round(x + ux * along - uy * across)},${round(y + uy * along + ux * across)}`;
  return `<polygon points="${point(size, 0)} ${point(-size * 0.6, size * 0.75)} ${point(-size * 0.6, -size * 0.75)}" fill="${colour}"/>`;
};

// ---------------------------------------------------------------------------
// التروس
// ---------------------------------------------------------------------------

const GEAR_RADIUS = 82;
const TURNS = ['مع عقارب الساعة', 'عكس عقارب الساعة'] as const;

/** Meshed gears turn opposite ways: gear `index` turns as the first iff even. */
export const gearTurnsLikeFirst = (index: number): boolean => index % 2 === 0;

export function gearsSvg(
  colours: ReadonlyArray<{ key: string; colour: string }>,
  clockwise: boolean,
): string {
  const step = 2 * GEAR_RADIUS - 14;
  const centres = colours.map((_, index) => ({
    x: index * step * Math.cos(Math.PI / 7),
    y: index % 2 ? step * Math.sin(Math.PI / 7) : 0,
  }));
  const left = (W - centres[centres.length - 1].x) / 2;
  const top = H / 2 - (step * Math.sin(Math.PI / 7)) / 2 + 20;
  let body = '';
  centres.forEach((centre, index) => {
    const cx = left + centre.x;
    const cy = top + centre.y;
    let points = '';
    for (let k = 0; k < 40; k += 1) {
      // Four points a tooth: two out, two in. Neighbours are half a tooth
      // out of step, so teeth sit in gaps.
      const radius = k % 4 < 2 ? GEAR_RADIUS : GEAR_RADIUS - 17;
      const angle = ((k - 0.5) * Math.PI) / 20 + (index % 2 ? Math.PI / 10 : 0);
      points += `${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))} `;
    }
    body +=
      `<g data-gear="${colours[index].key}">` +
      `<polygon points="${points.trim()}" fill="${colours[index].colour}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
      `<circle cx="${round(cx)}" cy="${round(cy)}" r="20" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/></g>`;
  });
  // The turn of the first gear: an arc over it with its head at the leading end.
  const cx = left;
  const cy = top;
  const radius = GEAR_RADIUS + 30;
  const at = (degrees: number) => ({
    x: cx + radius * Math.cos((degrees * Math.PI) / 180),
    y: cy + radius * Math.sin((degrees * Math.PI) / 180),
  });
  const from = at(-150);
  const to = at(-30);
  const head = clockwise ? to : from;
  const headAngle = ((clockwise ? -30 : -150) * Math.PI) / 180;
  const sign = clockwise ? 1 : -1;
  body +=
    `<path data-turn="${clockwise ? 'clockwise' : 'counter'}" d="M${round(from.x)} ${round(from.y)} A ${radius} ${radius} 0 0 1 ${round(to.x)} ${round(to.y)}" fill="none" stroke="${RED}" stroke-width="12" stroke-linecap="round"/>` +
    arrowHead(
      head.x,
      head.y,
      -Math.sin(headAngle) * sign,
      Math.cos(headAngle) * sign,
      26,
      RED,
    );
  return frame(body);
}

function composeGears(seed: string, variantKey: string): ComposedPuzzleDrawing {
  const random = seededRandom(`gear-train-direction:${variantKey}:${seed}`);
  const count =
    variantKey === 'same-as-first'
      ? pick([5, 6], random)
      : pick([3, 4, 5, 6], random);
  const gears = shuffled(NAMED_COLOURS, random).slice(0, count);
  const clockwise = random() < 0.5;
  const turn = TURNS[clockwise ? 0 : 1];
  const shared = {
    familyKey: 'gear-train-direction',
    variantKey,
    altText: `${count} تروس متشابكة في صف، وسهم يبيّن اتجاه دوران الأول`,
    svg: gearsSvg(gears, clockwise),
  };

  if (variantKey === 'same-as-first') {
    const like = pick(
      gears
        .map((_, index) => index)
        .filter((index) => index >= 2 && index % 2 === 0),
      random,
    );
    const unlike = shuffled(
      gears.map((_, index) => index).filter((index) => index % 2 === 1),
      random,
    ).slice(0, 3);
    const { options, correctOptionId } = asOptions(
      [like, ...unlike].map((index) => gears[index].name),
      gears[like].name,
      random,
    );
    return {
      ...shared,
      variant: `${variantKey}:${count}:${gears[like].key}`,
      prompt: `أي ترس يدور بنفس اتجاه الترس ${gears[0].name}؟`,
      options,
      correctOptionId,
      distractorRationale: sameReason(
        options,
        correctOptionId,
        'It is an odd number of gears away from the first, so it turns the other way.',
      ),
      concept:
        'Every meshed gear reverses the turn: find the gear an even number of steps from the first.',
      factualClaim: `Gear ${like + 1} ("${gears[like].key}") is an even number of meshes from gear 1, so it turns the same way.`,
    };
  }

  if (variantKey === 'count-direction') {
    const answer = Math.ceil(count / 2);
    const { options, correctOptionId } = countOptions(answer, random);
    return {
      ...shared,
      variant: `${variantKey}:${count}:${answer}`,
      prompt: `الترس ${gears[0].name} يدور ${turn}. كم ترس بالمجموع يدور ${turn}؟`,
      options,
      correctOptionId,
      distractorRationale: sameReason(
        options,
        correctOptionId,
        'Counts a gear that turns the other way, or misses one that turns with the first.',
      ),
      concept:
        'Every meshed gear reverses the turn: count the gears turning as the first does.',
      factualClaim: `Of ${count} gears in a row, ${answer} turn as the first does (every second one).`,
    };
  }

  const last = count - 1;
  const same = gearTurnsLikeFirst(last);
  const answer = TURNS[clockwise === same ? 0 : 1];
  const { options, correctOptionId } = asOptions(
    [...TURNS, 'ما يتحرك'],
    answer,
    random,
  );
  return {
    ...shared,
    variant: `${variantKey}:${count}:${clockwise ? 'clockwise' : 'counter'}`,
    prompt: `الترس ${gears[0].name} يدور ${turn}. الترس ${gears[last].name} يدور لوين؟`,
    options,
    correctOptionId,
    distractorRationale: sameReason(options, correctOptionId, (id) =>
      options.find((option) => option.id === id)!.label === 'ما يتحرك'
        ? 'A row of gears never jams; only a closed ring of an odd number does.'
        : 'Loses count of the reversals along the row.',
    ),
    concept:
      'Every meshed gear reverses the turn: carry the direction along the row to the last gear.',
    factualClaim: `Gear ${count} is ${last} mesh(es) from gear 1, so it turns ${same ? 'the same way' : 'the opposite way'}.`,
  };
}

// ---------------------------------------------------------------------------
// المتاهة
// ---------------------------------------------------------------------------

const MAZE = { columns: 8, rows: 5, cell: 100, x: 200, y: 87 };

export interface Maze {
  /** Open passages between neighbouring cells, as "low-high" cell pairs. */
  open: Set<string>;
  /** The part of the maze each cell belongs to: three sealed parts. */
  part: number[];
}

const passage = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

function mazeNeighbours(cell: number): number[] {
  const column = cell % MAZE.columns;
  const row = Math.floor(cell / MAZE.columns);
  return [
    column > 0 ? cell - 1 : -1,
    column < MAZE.columns - 1 ? cell + 1 : -1,
    row > 0 ? cell - MAZE.columns : -1,
    row < MAZE.rows - 1 ? cell + MAZE.columns : -1,
  ].filter((other) => other >= 0);
}

/** How far every cell is from `from` through open passages; -1 if sealed off. */
export function mazeDistances(open: Set<string>, from: number): number[] {
  const distance = new Array<number>(MAZE.columns * MAZE.rows).fill(-1);
  distance[from] = 0;
  const queue = [from];
  while (queue.length) {
    const cell = queue.shift()!;
    for (const other of mazeNeighbours(cell)) {
      if (distance[other] >= 0 || !open.has(passage(cell, other))) continue;
      distance[other] = distance[cell] + 1;
      queue.push(other);
    }
  }
  return distance;
}

/**
 * A maze with one way between any two cells, then two passages walled up so
 * that it falls into three sealed parts, none of them small.
 */
export function buildMaze(random: () => number): Maze {
  const total = MAZE.columns * MAZE.rows;
  const open = new Set<string>();
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const next = shuffled(
      mazeNeighbours(cell).filter((other) => !seen.has(other)),
      random,
    )[0];
    if (next === undefined) {
      stack.pop();
      continue;
    }
    open.add(passage(cell, next));
    seen.add(next);
    stack.push(next);
  }
  const passages = shuffled([...open], random);
  const partsOf = (walled: Set<string>) => {
    const part = new Array<number>(total).fill(-1);
    let parts = 0;
    for (let cell = 0; cell < total; cell += 1) {
      if (part[cell] >= 0) continue;
      mazeDistances(walled, cell).forEach((distance, other) => {
        if (distance >= 0) part[other] = parts;
      });
      parts += 1;
    }
    return part;
  };
  let best: { part: number[]; open: Set<string>; smallest: number } | undefined;
  for (let a = 0; a < passages.length; a += 1) {
    for (let b = a + 1; b < passages.length; b += 1) {
      const walled = new Set(open);
      walled.delete(passages[a]);
      walled.delete(passages[b]);
      const part = partsOf(walled);
      const smallest = Math.min(
        ...[0, 1, 2].map((index) => part.filter((p) => p === index).length),
      );
      if (!best || smallest > best.smallest) {
        best = { part, open: walled, smallest };
      }
      if (smallest >= 9) return { open: walled, part };
    }
  }
  return { open: best!.open, part: best!.part };
}

const mazeCentre = (cell: number) => ({
  x: MAZE.x + (cell % MAZE.columns) * MAZE.cell + MAZE.cell / 2,
  y: MAZE.y + Math.floor(cell / MAZE.columns) * MAZE.cell + MAZE.cell / 2,
});

export function mazeSvg(
  maze: Maze,
  marks: ReadonlyArray<{
    cell: number;
    key: string;
    thing?: DrawnThing;
    letter?: string;
  }>,
): string {
  const width = MAZE.columns * MAZE.cell;
  const height = MAZE.rows * MAZE.cell;
  let body = `<rect x="${MAZE.x}" y="${MAZE.y}" width="${width}" height="${height}" fill="#FFFFFF" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`;
  let walls = '';
  for (let cell = 0; cell < MAZE.columns * MAZE.rows; cell += 1) {
    const column = cell % MAZE.columns;
    const row = Math.floor(cell / MAZE.columns);
    const x = MAZE.x + column * MAZE.cell;
    const y = MAZE.y + row * MAZE.cell;
    if (column < MAZE.columns - 1 && !maze.open.has(passage(cell, cell + 1))) {
      walls += `M${x + MAZE.cell} ${y} v${MAZE.cell} `;
    }
    if (
      row < MAZE.rows - 1 &&
      !maze.open.has(passage(cell, cell + MAZE.columns))
    ) {
      walls += `M${x} ${y + MAZE.cell} h${MAZE.cell} `;
    }
  }
  body += `<path d="${walls.trim()}" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  for (const mark of marks) {
    const { x, y } = mazeCentre(mark.cell);
    body += `<g data-mark="${mark.key}" data-cell="${mark.cell}">${
      mark.thing
        ? thingSvg(mark.thing, x, y, 84)
        : letterBadge(mark.letter!, x, y, 28)
    }</g>`;
  }
  return frame(body);
}

function composeMaze(seed: string, variantKey: string): ComposedPuzzleDrawing {
  const random = seededRandom(`maze-exit-route:${variantKey}:${seed}`);
  const maze = buildMaze(random);
  const cellsOf = (part: number) =>
    maze.part
      .map((p, cell) => (p === part ? cell : -1))
      .filter((cell) => cell >= 0);
  const [home, ...sealed] = shuffled([0, 1, 2], random);
  // The two ends of the longest walk in the home part: far apart, so the way
  // between them has to be traced rather than seen.
  const farthest = (from: number) => {
    const distance = mazeDistances(maze.open, from);
    return distance.indexOf(Math.max(...distance));
  };
  const one = farthest(pick(cellsOf(home), random));
  const other = farthest(one);
  const decoys = sealed.map((part) => pick(cellsOf(part), random));

  // One thing on its own and three of another kind; letters when the library
  // of drawn things is not on this host.
  const kinds = shuffled(
    (['animal', 'food', 'object', 'play'] as const).filter(
      (category) => drawnThingsOf(category).length >= 6,
    ),
    random,
  );
  const dressed = kinds.length >= 2;
  const single = dressed ? pick(drawnThingsOf(kinds[0]), random) : undefined;
  const choices = dressed
    ? shuffled(drawnThingsOf(kinds[1]), random).slice(0, 3)
    : [];
  const choiceCells = shuffled([other, ...decoys], random);
  const names = choiceCells.map((_, index) =>
    dressed ? choices[index].the : `الحرف ${LETTERS[index]}`,
  );
  const answer = names[choiceCells.indexOf(other)];
  const { options, correctOptionId } = asOptions(names, answer, random);
  const marks = [
    { cell: one, key: single?.key ?? 'ball', thing: single, letter: '●' },
    ...choiceCells.map((cell, index) => ({
      cell,
      key: dressed ? choices[index].key : LETTERS[index],
      thing: dressed ? choices[index] : undefined,
      letter: LETTERS[index],
    })),
  ];
  const singleName = single?.the ?? 'النقطة';
  return {
    familyKey: 'maze-exit-route',
    variantKey,
    variant: `${variantKey}:${dressed ? `${kinds[0]}-to-${kinds[1]}` : 'plain'}:${one}:${other}`,
    prompt:
      variantKey === 'from-which'
        ? `أي واحد له طريق مفتوح ${toThe(singleName)}؟`
        : `تبدأ من عند ${singleName}. توصل لأي واحد من غير ما تعدّي جدار؟`,
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      'It sits in a part of the maze that is walled off from the other end; every way toward it stops at a wall.',
    ),
    altText: 'متاهة فيها أربعة أشياء، وواحد منها فقط له طريق مفتوح إلى الآخر',
    concept:
      'Trace the open way through a maze: only one of three marks shares a part of it with the fourth.',
    factualClaim: `Cells ${one} and ${other} are in one sealed part of the maze; the other two marks are in the other two parts.`,
    svg: mazeSvg(maze, marks),
  };
}

// ---------------------------------------------------------------------------
// أطول حبل
// ---------------------------------------------------------------------------

const ROPE_UNIT = 80;

/** A rope as the column it is in on each of six rows; it drops a row at a time. */
export const ropeLength = (columns: readonly number[]): number =>
  columns.length -
  1 +
  columns
    .slice(1)
    .reduce((sum, column, index) => sum + Math.abs(column - columns[index]), 0);

export function ropesSvg(
  ropes: ReadonlyArray<{
    key: string;
    colour: string;
    columns: readonly number[];
  }>,
): string {
  let body = '';
  ropes.forEach((rope, lane) => {
    const left = 220 + lane * 380 - 1.5 * ROPE_UNIT;
    const top = (H - 5 * ROPE_UNIT) / 2;
    let path = `M${left + rope.columns[0] * ROPE_UNIT} ${top}`;
    for (let row = 1; row < rope.columns.length; row += 1) {
      path += ` V${top + row * ROPE_UNIT} H${left + rope.columns[row] * ROPE_UNIT}`;
    }
    const end = rope.columns[rope.columns.length - 1];
    body +=
      `<g data-rope="${rope.key}" data-length="${ropeLength(rope.columns)}">` +
      `<path d="${path}" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${path}" fill="none" stroke="${rope.colour}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="${left + rope.columns[0] * ROPE_UNIT}" cy="${top}" r="20" fill="${rope.colour}" stroke="${INK}" stroke-width="7"/>` +
      `<circle cx="${left + end * ROPE_UNIT}" cy="${top + 5 * ROPE_UNIT}" r="20" fill="${rope.colour}" stroke="${INK}" stroke-width="7"/></g>`;
  });
  return frame(body);
}

function composeRopes(seed: string, variantKey: string): ComposedPuzzleDrawing {
  const random = seededRandom(`shortest-path-grid:${variantKey}:${seed}`);
  const colours = shuffled(NAMED_COLOURS, random).slice(0, 3);
  const draw = (): number[] => {
    const columns = [Math.floor(random() * 4)];
    for (let row = 1; row < 6; row += 1) {
      columns.push(
        pick(
          [0, 1, 2, 3].filter((column) => column !== columns[row - 1]),
          random,
        ),
      );
    }
    return columns;
  };
  // Three lengths at least two units apart: a difference that can be seen.
  let shapes = [
    [0, 1, 0, 1, 0, 1],
    [0, 2, 0, 2, 1, 3],
    [0, 3, 0, 3, 0, 3],
  ];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = [draw(), draw(), draw()];
    const lengths = candidate.map(ropeLength).sort((a, b) => a - b);
    if (lengths[1] - lengths[0] >= 2 && lengths[2] - lengths[1] >= 2) {
      shapes = candidate;
      break;
    }
  }
  const ropes = colours.map((colour, index) => ({
    ...colour,
    columns: shapes[index],
  }));
  const ranked = [...ropes].sort(
    (a, b) => ropeLength(a.columns) - ropeLength(b.columns),
  );
  const answer = variantKey === 'shortest' ? ranked[0] : ranked[2];
  const { options, correctOptionId } = asOptions(
    ropes.map((rope) => rope.name),
    answer.name,
    random,
  );
  return {
    familyKey: 'shortest-path-grid',
    variantKey,
    variant: `${variantKey}:${ropes.map((rope) => `${rope.key}=${ropeLength(rope.columns)}`).join(',')}`,
    prompt:
      variantKey === 'shortest'
        ? 'لو شدّينا الحبال الثلاثة، أي حبل يطلع الأقصر؟'
        : 'لو شدّينا الحبال الثلاثة، أي حبل يطلع الأطول؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      'All three ropes drop the same height; this one makes fewer or more sideways runs than it seems to.',
    ),
    altText: 'ثلاثة حبال ملوّنة متعرّجة جنب بعض، بنفس الارتفاع',
    concept:
      'Three winding ropes of equal height: judge their true lengths by their sideways runs.',
    factualClaim: `Lengths in units: ${ropes.map((rope) => `${rope.key} ${ropeLength(rope.columns)}`).join(', ')}.`,
    svg: ropesSvg(ropes),
  };
}

// ---------------------------------------------------------------------------
// الدومينو
// ---------------------------------------------------------------------------

export interface DominoRow {
  heights: number[];
  /** `gaps[i]` — the clear space between domino i and domino i+1. */
  gaps: number[];
}

const DOMINO_WIDTH = 30;

/** A falling domino knocks the next one when the gap is shorter than itself. */
export function dominoesFallen(row: DominoRow): number {
  let fallen = 1;
  while (
    fallen < row.heights.length &&
    row.gaps[fallen - 1] < row.heights[fallen - 1]
  ) {
    fallen += 1;
  }
  return fallen;
}

export function dominoesSvg(row: DominoRow): string {
  const floor = 560;
  const span =
    row.heights.length * DOMINO_WIDTH +
    row.gaps.reduce((sum, gap) => sum + gap, 0);
  // Drawn as large as the page allows; one scale for every length, so what
  // reaches what is unchanged.
  const scale = Math.min(1.7, 940 / span);
  const width = DOMINO_WIDTH * scale;
  let x = (W - span * scale) / 2 + 60;
  let body = `<line x1="50" y1="${floor}" x2="${W - 50}" y2="${floor}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  const first = x;
  row.heights.forEach((tall, index) => {
    const height = tall * scale;
    body +=
      `<g data-domino="${index + 1}">` +
      `<rect x="${round(x)}" y="${round(floor - height)}" width="${round(width)}" height="${round(height)}" rx="6" fill="${index % 2 ? '#2F6FE0' : '#F2C230'}" stroke="${INK}" stroke-width="8"/>` +
      `<text x="${round(x + width / 2)}" y="${round(floor - height - 22)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="48" fill="${INK}">${index + 1}</text></g>`;
    x += width + (row.gaps[index] ?? 0) * scale;
  });
  // The push: an arrow into the top of the first domino.
  const pushY = floor - row.heights[0] * scale + 34;
  body +=
    `<line x1="${round(first - 120)}" y1="${round(pushY)}" x2="${round(first - 36)}" y2="${round(pushY)}" stroke="${RED}" stroke-width="14" stroke-linecap="round"/>` +
    arrowHead(first - 28, pushY, 1, 0, 26, RED);
  return frame(body);
}

function composeDominoes(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`domino-cascade-chain:${variantKey}:${seed}`);
  const count = pick([6, 7], random);
  // Short and tall dominoes; a gap is plainly within reach, plainly out of
  // reach, or in between — within a tall one's reach and out of a short one's.
  const row: DominoRow = { heights: [], gaps: [] };
  const stop = 2 + Math.floor(random() * (count - 2));
  for (let index = 0; index < count; index += 1) {
    const tall = random() < 0.4;
    row.heights.push(tall ? 200 : 120);
    if (index === count - 1) break;
    const reaches = index + 1 !== stop;
    row.gaps.push(
      reaches
        ? tall && random() < 0.6
          ? 150
          : 55
        : tall
          ? 270
          : pick([165, 240], random),
    );
  }
  const fallen = dominoesFallen(row);
  const piece = (value: number) => `القطعة ${value}`;
  const shared = {
    familyKey: 'domino-cascade-chain',
    variantKey,
    variant: `${variantKey}:${count}:${fallen}`,
    altText: `${count} قطع دومينو مرقّمة واقفة في صف بمسافات مختلفة، وسهم يدفع الأولى`,
    factualClaim: `Pushed from domino 1, dominoes 1 to ${fallen} fall; the gap after domino ${fallen} is longer than it is tall.`,
    svg: dominoesSvg(row),
  };
  if (variantKey === 'count-standing') {
    const { options, correctOptionId } = countOptions(
      count - fallen,
      random,
      (value) => (value === 0 ? 'ولا وحدة' : String(value)),
      0,
    );
    return {
      ...shared,
      prompt: 'دفّينا القطعة 1 باتجاه السهم. كم قطعة تبقى واقفة؟',
      options,
      correctOptionId,
      distractorRationale: sameReason(
        options,
        correctOptionId,
        'Misjudges one gap: a tall piece reaches farther than a short one, and a piece past a wide gap is never touched.',
      ),
      concept:
        'A falling domino reaches as far as its own height: find where the chain stops and count what is left.',
    };
  }
  const { options, correctOptionId } = countOptions(
    fallen,
    random,
    piece,
    1,
    count,
  );
  return {
    ...shared,
    prompt: 'دفّينا القطعة 1 باتجاه السهم. وش آخر قطعة تطيح؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      'Misjudges one gap: a tall piece reaches farther than a short one, and a piece past a wide gap is never touched.',
    ),
    concept:
      'A falling domino reaches as far as its own height: find the last piece the chain reaches.',
  };
}

// ---------------------------------------------------------------------------
// الطرق باتجاه واحد
// ---------------------------------------------------------------------------

const ROADS = { columns: 4, rows: 3 };

export interface RoadMap {
  /** One-way roads between neighbouring junctions, as [from, to]. */
  roads: Array<[number, number]>;
}

/** The junctions a car can reach from the start, following the arrows. */
export function junctionsReached(map: RoadMap, start: number): Set<number> {
  const reached = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const junction = queue.shift()!;
    for (const [from, to] of map.roads) {
      if (from !== junction || reached.has(to)) continue;
      reached.add(to);
      queue.push(to);
    }
  }
  return reached;
}

const ROAD_START = ROADS.columns; // the left end of the middle row
const roadExit = (row: number) => row * ROADS.columns + ROADS.columns - 1;

export function buildRoadMap(
  random: () => number,
  exitsReached: number,
): RoadMap {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const roads: Array<[number, number]> = [];
    for (
      let junction = 0;
      junction < ROADS.columns * ROADS.rows;
      junction += 1
    ) {
      const column = junction % ROADS.columns;
      const row = Math.floor(junction / ROADS.columns);
      if (column < ROADS.columns - 1 && random() < 0.9) {
        roads.push(
          random() < 0.62 ? [junction, junction + 1] : [junction + 1, junction],
        );
      }
      if (row < ROADS.rows - 1 && random() < 0.85) {
        roads.push(
          random() < 0.5
            ? [junction, junction + ROADS.columns]
            : [junction + ROADS.columns, junction],
        );
      }
    }
    const reached = junctionsReached({ roads }, ROAD_START);
    if (
      [0, 1, 2].filter((row) => reached.has(roadExit(row))).length ===
        exitsReached &&
      reached.size >= 6
    ) {
      return { roads };
    }
  }
  // Never needed in practice: a plain map with the wanted number of open rows.
  const roads: Array<[number, number]> = [[ROAD_START, 0]];
  for (let row = 0; row < exitsReached; row += 1) {
    for (let column = 0; column < ROADS.columns - 1; column += 1) {
      roads.push([
        row * ROADS.columns + column,
        row * ROADS.columns + column + 1,
      ]);
    }
    if (row > 0) roads.push([0, ROADS.columns]);
  }
  return { roads };
}

export function roadsSvg(map: RoadMap, letters: readonly string[]): string {
  const at = (junction: number) => ({
    x: 300 + (junction % ROADS.columns) * 200,
    y: 137 + Math.floor(junction / ROADS.columns) * 200,
  });
  let body = '';
  const road = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    attributes: string,
  ) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    return (
      `<g ${attributes}><line x1="${round(from.x + ux * 26)}" y1="${round(from.y + uy * 26)}" x2="${round(to.x - ux * 26)}" y2="${round(to.y - uy * 26)}" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` +
      `${arrowHead(from.x + dx * 0.56, from.y + dy * 0.56, dx, dy, 26, RED)}</g>`
    );
  };
  for (const [from, to] of map.roads) {
    body += road(at(from), at(to), `data-road="${from}-${to}"`);
  }
  for (let junction = 0; junction < ROADS.columns * ROADS.rows; junction += 1) {
    const { x, y } = at(junction);
    body += `<circle cx="${x}" cy="${y}" r="17" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>`;
  }
  // The car drives in at the left of the middle row; each row ends at a lot.
  const start = at(ROAD_START);
  body += road({ x: start.x - 130, y: start.y }, start, 'data-entry="1"');
  const car = drawnThings().find((thing) => thing.key === 'car');
  body += car
    ? thingSvg(car, start.x - 190, start.y, 110)
    : `<circle cx="${start.x - 190}" cy="${start.y}" r="40" fill="${RED}" stroke="${INK}" stroke-width="8"/>`;
  letters.forEach((letter, row) => {
    const exit = at(roadExit(row));
    body += road(exit, { x: exit.x + 130, y: exit.y }, `data-exit="${row}"`);
    body += `<g data-lot="${letter}">${letterBadge(letter, exit.x + 180, exit.y, 44)}</g>`;
  });
  return frame(body);
}

function composeRoads(seed: string, variantKey: string): ComposedPuzzleDrawing {
  const random = seededRandom(`one-way-traffic-flow:${variantKey}:${seed}`);
  const wanted = variantKey === 'unreachable' ? 2 : 1;
  const map = buildRoadMap(random, wanted);
  const reached = junctionsReached(map, ROAD_START);
  const open = [0, 1, 2].filter((row) => reached.has(roadExit(row)));
  const answerRow =
    variantKey === 'unreachable'
      ? [0, 1, 2].find((row) => !open.includes(row))!
      : open[0];
  const lot = (row: number) => `الموقف ${LETTERS[row]}`;
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map(lot),
    lot(answerRow),
    random,
  );
  return {
    familyKey: 'one-way-traffic-flow',
    variantKey,
    variant: `${variantKey}:${LETTERS[answerRow]}:${map.roads.length}`,
    prompt:
      variantKey === 'unreachable'
        ? 'السيارة تمشي مع اتجاه الأسهم بس. أي موقف ما تقدر توصله؟'
        : 'السيارة تمشي مع اتجاه الأسهم بس. توصل لأي موقف؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      variantKey === 'unreachable'
        ? 'There is a way to it that follows every arrow.'
        : 'Every way toward it meets an arrow pointing against the car.',
    ),
    altText:
      'شبكة طرق بأسهم اتجاه واحد، سيارة على اليسار وثلاثة مواقف بحروف على اليمين',
    concept:
      'Follow one-way arrows through a small grid of roads to see which lot a car can reach.',
    factualClaim: `Following the arrows from the entry, the car reaches lot(s) ${open.map((row) => LETTERS[row]).join(', ')} and no other.`,
    svg: roadsSvg(map, LETTERS.slice(0, 3)),
  };
}

// ---------------------------------------------------------------------------
// الدارة الكهربائية
// ---------------------------------------------------------------------------

/** `branches[i]` — the switches on lamp i's wire; true is closed. */
export const lampLights = (switches: readonly boolean[]): boolean =>
  switches.every(Boolean);

export function circuitSvg(
  branches: ReadonlyArray<readonly boolean[]>,
): string {
  const left = 300;
  const right = 1010;
  const rows = [140, 320, 500];
  const wire = `fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"`;
  // The battery on the left; one rail up to the top wire, one along the floor.
  let body =
    `<path d="M150 250 V${rows[0]} H${left} V${rows[2]}" ${wire}/>` +
    `<path d="M150 400 V610 H${right} V${rows[0]}" ${wire}/>` +
    `<rect x="110" y="250" width="80" height="150" rx="12" fill="#F2C230" stroke="${INK}" stroke-width="10"/>` +
    `<rect x="135" y="232" width="30" height="18" fill="${INK}"/>` +
    `<path d="M135 290 h30 M150 275 v30 M135 365 h30" ${wire}/>`;
  branches.forEach((switches, branch) => {
    const y = rows[branch];
    const lampX = 860;
    const places = switches.length === 1 ? [520] : [450, 640];
    let from = left;
    switches.forEach((closed, index) => {
      const x = places[index];
      body += `<path d="M${from} ${y} H${x - 45}" ${wire}/>`;
      body +=
        `<g data-switch="${branch}-${index}" data-closed="${closed}">` +
        (closed
          ? `<path d="M${x - 45} ${y} H${x + 45}" ${wire}/>`
          : `<path d="M${x - 45} ${y} L${x + 32} ${y - 52}" ${wire}/>`) +
        `<circle cx="${x - 45}" cy="${y}" r="12" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>` +
        `<circle cx="${x + 45}" cy="${y}" r="12" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/></g>`;
      from = x + 45;
    });
    body +=
      `<path d="M${from} ${y} H${lampX - 44} M${lampX + 44} ${y} H${right}" ${wire}/>` +
      `<g data-lamp="${LETTERS[branch]}"><circle cx="${lampX}" cy="${y}" r="44" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
      `<path d="M${lampX - 28} ${y - 28} L${lampX + 28} ${y + 28} M${lampX + 28} ${y - 28} L${lampX - 28} ${y + 28}" ${wire}/>` +
      `${letterBadge(LETTERS[branch], lampX, y - 78, 28)}</g>`;
  });
  return frame(body);
}

function composeCircuit(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(
    `electrical-switch-circuit:${variantKey}:${seed}`,
  );
  const lit = variantKey === 'which-stays-off' ? 2 : 1;
  const litBranches = shuffled([0, 1, 2], random).slice(0, lit);
  const branches = [0, 1, 2].map((branch) => {
    const count = pick([1, 2, 2], random);
    const switches = new Array<boolean>(count).fill(true);
    // A dark lamp has at least one open switch; with two, sometimes only one
    // of them — the wire looks nearly whole.
    if (!litBranches.includes(branch)) {
      const open = Math.floor(random() * count);
      switches[open] = false;
      if (count === 2 && random() < 0.3) switches[1 - open] = false;
    }
    return switches;
  });
  const answer =
    variantKey === 'which-stays-off'
      ? [0, 1, 2].find((branch) => !litBranches.includes(branch))!
      : litBranches[0];
  const lamp = (branch: number) => `اللمبة ${LETTERS[branch]}`;
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map(lamp),
    lamp(answer),
    random,
  );
  return {
    familyKey: 'electrical-switch-circuit',
    variantKey,
    variant: `${variantKey}:${LETTERS[answer]}:${branches.map((switches) => switches.map((closed) => (closed ? '1' : '0')).join('')).join('-')}`,
    prompt:
      variantKey === 'which-stays-off'
        ? 'وصّلنا البطارية. أي لمبة ما تشتغل؟'
        : 'وصّلنا البطارية. أي لمبة تشتغل؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      variantKey === 'which-stays-off'
        ? 'Every switch on its wire is closed, so the current reaches it.'
        : 'A switch on its wire is open, so no current reaches it.',
    ),
    altText:
      'بطارية وثلاث لمبات بحروف، كل لمبة على سلك فيه مفاتيح مفتوحة أو مقفلة',
    concept:
      'A lamp lights only when every switch on its own wire is closed: read three wires.',
    factualClaim: `Lamp(s) ${[0, 1, 2]
      .filter((branch) => lampLights(branches[branch]))
      .map((branch) => LETTERS[branch])
      .join(', ')} have every switch closed; the rest have an open one.`,
    svg: circuitSvg(branches),
  };
}

export function composePaths(
  familyKey: PathsFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  if (familyKey === 'gear-train-direction')
    return composeGears(seed, variantKey);
  if (familyKey === 'maze-exit-route') return composeMaze(seed, variantKey);
  if (familyKey === 'shortest-path-grid') return composeRopes(seed, variantKey);
  if (familyKey === 'domino-cascade-chain')
    return composeDominoes(seed, variantKey);
  if (familyKey === 'one-way-traffic-flow')
    return composeRoads(seed, variantKey);
  return composeCircuit(seed, variantKey);
}
