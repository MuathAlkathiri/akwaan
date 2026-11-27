import {
  ComposedPuzzleDrawing,
  GOLD,
  INK,
  LETTERS,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  frame,
  letterBadge,
  pick,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';

/**
 * اقرأ خصمك in the visual Scopes and اكتشف الخطأ: puzzles of their own, never
 * shared with إكس أو. Each answer is proved by the engine — a beam traced, a
 * pipe joined, every door tried, every set of weights tried.
 */
export const RYO_VARIANTS = {
  'mirror-beam': ['three-mirrors', 'five-mirrors'],
  'last-pipe-piece': ['water', 'wire', 'turned'],
  'lying-guard': ['one-liar', 'four-guards', 'one-honest'],
  'false-scale': ['three-shapes', 'level-trap'],
} as const;

export type RyoFamily = keyof typeof RYO_VARIANTS;

const BLUE = '#2F6FE0';
const SILVER = '#8C93A8';

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
  anchor = 'middle',
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

const lettered = (correct: number, labels = LETTERS) => {
  const options = labels.map((label, index) => ({
    id: ['a', 'b', 'c', 'd'][index],
    label,
  }));
  return { options, correctOptionId: options[correct].id };
};

// ---------------------------------------------------------------------------
// «الشعاع وين يوصل؟»
// ---------------------------------------------------------------------------

const MCOLS = 6;
const MROWS = 4;
type Dir = [number, number];

export interface MirrorBoard {
  mirrors: Map<string, '/' | '\\'>;
  entryRow: number;
}

/** Where the beam leaves the board, and how many mirrors it touched. */
export function traceBeam(board: MirrorBoard): {
  exit: string;
  hits: number;
} {
  let x = MCOLS;
  let y = board.entryRow;
  let [dx, dy]: Dir = [-1, 0];
  let hits = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= MCOLS || y >= MROWS) {
      return { exit: `${x},${y}`, hits };
    }
    const mirror = board.mirrors.get(`${x},${y}`);
    if (mirror === '/') [dx, dy] = [-dy, -dx];
    if (mirror === '\\') [dx, dy] = [dy, dx];
    if (mirror) hits += 1;
  }
  throw new Error('beam did not leave the board');
}

/** Every square just outside the board where a beam can come out. */
const borderSlots = (): string[] => {
  const slots: string[] = [];
  for (let x = 0; x < MCOLS; x += 1) slots.push(`${x},-1`, `${x},${MROWS}`);
  for (let y = 0; y < MROWS; y += 1) slots.push(`-1,${y}`, `${MCOLS},${y}`);
  return slots;
};

function composeMirrorBeam(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`mirror-beam:${variantKey}:${seed}`);
  const count = variantKey === 'five-mirrors' ? 5 : 3;
  const needed = variantKey === 'five-mirrors' ? 3 : 2;
  for (;;) {
    const mirrors = new Map<string, '/' | '\\'>();
    while (mirrors.size < count) {
      mirrors.set(
        `${Math.floor(random() * MCOLS)},${Math.floor(random() * MROWS)}`,
        random() < 0.5 ? '/' : '\\',
      );
    }
    const board = { mirrors, entryRow: Math.floor(random() * MROWS) };
    const { exit, hits } = traceBeam(board);
    if (hits < needed) continue;
    const entry = `${MCOLS},${board.entryRow}`;
    if (exit === entry) continue;
    const others = shuffled(
      borderSlots().filter((slot) => slot !== exit && slot !== entry),
      random,
    ).slice(0, 3);
    const targets = shuffled([exit, ...others], random);
    const correct = targets.indexOf(exit);
    const cell = 104;
    const x0 = (W - MCOLS * cell) / 2;
    const y0 = 120;
    const centre = (slot: string) => {
      const [x, y] = slot.split(',').map(Number);
      return { x: x0 + x * cell + cell / 2, y: y0 + y * cell + cell / 2 };
    };
    let body = `<rect x="${x0}" y="${y0}" width="${MCOLS * cell}" height="${MROWS * cell}" rx="18" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>`;
    for (let x = 1; x < MCOLS; x += 1) {
      body += `<line x1="${x0 + x * cell}" y1="${y0}" x2="${x0 + x * cell}" y2="${y0 + MROWS * cell}" stroke="#D9D3C6" stroke-width="3"/>`;
    }
    for (let y = 1; y < MROWS; y += 1) {
      body += `<line x1="${x0}" y1="${y0 + y * cell}" x2="${x0 + MCOLS * cell}" y2="${y0 + y * cell}" stroke="#D9D3C6" stroke-width="3"/>`;
    }
    for (const [slot, kind] of mirrors) {
      const { x, y } = centre(slot);
      const d = cell * 0.36;
      const [ax, ay, bx, by] =
        kind === '/'
          ? [x - d, y + d, x + d, y - d]
          : [x - d, y - d, x + d, y + d];
      body += `<line data-mirror="${slot}:${kind}" x1="${round(ax)}" y1="${round(ay)}" x2="${round(bx)}" y2="${round(by)}" stroke="${SILVER}" stroke-width="16" stroke-linecap="round"/><line x1="${round(ax)}" y1="${round(ay)}" x2="${round(bx)}" y2="${round(by)}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
    }
    // The laser, outside the right edge, pointing in.
    const source = centre(entry);
    body += `<g data-source="${entry}"><rect x="${round(source.x - 30)}" y="${round(source.y - 26)}" width="70" height="52" rx="12" fill="${INK}"/><path d="M ${round(source.x - 30)} ${round(source.y)} l -34 0" stroke="${RED}" stroke-width="10" stroke-linecap="round"/><path d="M ${round(source.x - 70)} ${round(source.y)} l 16 -14 l 0 28 z" fill="${RED}"/></g>`;
    targets.forEach((slot, index) => {
      const { x, y } = centre(slot);
      body += `<g data-target="${slot}">${letterBadge(LETTERS[index], x, y, 34)}</g>`;
    });
    return {
      familyKey: 'mirror-beam',
      variantKey,
      variant: `${variantKey}:${[...mirrors].map(([s, k]) => `${s}${k}`).join(' ')}`,
      prompt: 'الليزر يطلع من اليمين وينعكس على كل مراية يمر فيها. وين يوصل؟',
      ...lettered(correct),
      distractorRationale: LETTERS.map((_, index) => index)
        .filter((index) => index !== correct)
        .map((index) => ({
          optionId: ['a', 'b', 'c', 'd'][index],
          why: 'The traced beam leaves the board at another square.',
        })),
      altText: 'شبكة فيها مرايا مايلة وليزر من اليمين وأهداف بحروف حول الشبكة',
      concept:
        'Trace a beam through angled mirrors to where it leaves the board.',
      factualClaim: `The beam enters at ${entry}, touches ${hits} mirrors and leaves at ${exit}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «القطعة الأخيرة» — the piece that joins the pipe
// ---------------------------------------------------------------------------

type Side = 'N' | 'E' | 'S' | 'W';
const STEP: Record<Side, Dir> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const PIECES = ['NS', 'EW', 'NE', 'ES', 'SW', 'NW'] as const;
const pieceOf = (a: Side, b: Side): string =>
  PIECES.find((piece) => piece.includes(a) && piece.includes(b))!;

const PCOLS = 6;
const PROWS = 4;

/** A pipe from the right edge to the left one, square by square. */
function buildPipe(
  random: () => number,
): Array<{ x: number; y: number; piece: string }> {
  for (;;) {
    const start = { x: PCOLS - 1, y: Math.floor(random() * PROWS) };
    const path = [start];
    const seen = new Set([`${start.x},${start.y}`]);
    let ok = false;
    for (let guard = 0; guard < 60; guard += 1) {
      const last = path[path.length - 1];
      if (last.x === 0 && path.length >= 8) {
        ok = true;
        break;
      }
      const moves = shuffled(
        ['W', 'W', 'N', 'S', 'E'] as Side[],
        random,
      ).filter((side) => {
        const [dx, dy] = STEP[side];
        const x = last.x + dx;
        const y = last.y + dy;
        return (
          x >= 0 && y >= 0 && x < PCOLS && y < PROWS && !seen.has(`${x},${y}`)
        );
      });
      if (!moves.length) break;
      const [dx, dy] = STEP[moves[0]];
      const next = { x: last.x + dx, y: last.y + dy };
      seen.add(`${next.x},${next.y}`);
      path.push(next);
    }
    if (!ok || path.length > 13) continue;
    return path.map((cell, index) => {
      const sideTo = (other: { x: number; y: number }): Side =>
        (Object.keys(STEP) as Side[]).find(
          (side) =>
            STEP[side][0] === other.x - cell.x &&
            STEP[side][1] === other.y - cell.y,
        )!;
      const inSide = index === 0 ? 'E' : sideTo(path[index - 1]);
      const outSide = index === path.length - 1 ? 'W' : sideTo(path[index + 1]);
      return { ...cell, piece: pieceOf(inSide, outSide) };
    });
  }
}

function pieceSvg(
  piece: string,
  cx: number,
  cy: number,
  size: number,
  colour: string,
): string {
  const half = size / 2;
  const end = (side: Side) => ({
    x: cx + STEP[side][0] * half,
    y: cy + STEP[side][1] * half,
  });
  const [a, b] = [...piece] as Side[];
  const p = end(a);
  const q = end(b);
  const straight = OPPOSITE[a] === b;
  const d = straight
    ? `M ${round(p.x)} ${round(p.y)} L ${round(q.x)} ${round(q.y)}`
    : `M ${round(p.x)} ${round(p.y)} Q ${round(cx)} ${round(cy)} ${round(q.x)} ${round(q.y)}`;
  return (
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${round(size * 0.34)}" stroke-linecap="butt"/>` +
    `<path data-piece="${piece}" d="${d}" fill="none" stroke="${colour}" stroke-width="${round(size * 0.22)}" stroke-linecap="butt"/>`
  );
}

function composeLastPipe(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`last-pipe-piece:${variantKey}:${seed}`);
  const path = buildPipe(random);
  const turned = variantKey === 'turned';
  const candidates = path
    .map((cell, index) => ({ cell, index }))
    .filter(
      ({ cell, index }) =>
        index > 0 &&
        index < path.length - 1 &&
        (!turned || !['NS', 'EW'].includes(cell.piece)),
    );
  const { cell: gap } = pick(candidates, random);
  const right = gap.piece;
  const wrongPool = turned
    ? ['NE', 'ES', 'SW', 'NW'].filter((piece) => piece !== right)
    : shuffled(
        PIECES.filter((piece) => piece !== right),
        random,
      )
        // One that shares a side with the right piece: it looks like it fits.
        .sort(
          (a, b) =>
            Number([...b].some((s) => right.includes(s))) -
            Number([...a].some((s) => right.includes(s))),
        )
        .slice(0, 3);
  const pieces = shuffled([right, ...wrongPool.slice(0, 3)], random);
  const correct = pieces.indexOf(right);
  const wire = variantKey === 'wire';
  const colour = wire ? GOLD : BLUE;
  const cell = 92;
  const x0 = (W - PCOLS * cell) / 2;
  const y0 = 50;
  let body = `<rect x="${x0}" y="${y0}" width="${PCOLS * cell}" height="${PROWS * cell}" rx="16" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (const step of path) {
    const cx = x0 + step.x * cell + cell / 2;
    const cy = y0 + step.y * cell + cell / 2;
    if (step === gap) {
      body +=
        `<rect data-gap="${step.x},${step.y}" x="${cx - cell / 2 + 6}" y="${cy - cell / 2 + 6}" width="${cell - 12}" height="${cell - 12}" rx="10" fill="#FFF4D6" stroke="${RED}" stroke-width="6" stroke-dasharray="12 8"/>` +
        text('؟', cx, cy + 16, 46, RED);
    } else {
      body += pieceSvg(step.piece, cx, cy, cell, colour);
    }
  }
  // Source on the right, the thing it must reach on the left.
  const first = path[0];
  const last = path[path.length - 1];
  const sy = y0 + first.y * cell + cell / 2;
  const ty = y0 + last.y * cell + cell / 2;
  body += wire
    ? `<g data-source="battery"><rect x="${x0 + PCOLS * cell + 8}" y="${sy - 34}" width="70" height="68" rx="10" fill="${INK}"/>${text('+', x0 + PCOLS * cell + 43, sy + 14, 40, GOLD)}</g>` +
      `<g data-sink="lamp"><circle cx="${x0 - 50}" cy="${ty - 6}" r="36" fill="#FFE07A" stroke="${INK}" stroke-width="6"/><rect x="${x0 - 66}" y="${ty + 26}" width="32" height="22" fill="${SILVER}" stroke="${INK}" stroke-width="4"/></g>`
    : `<g data-source="tap"><rect x="${x0 + PCOLS * cell + 8}" y="${sy - 26}" width="64" height="52" rx="10" fill="${SILVER}" stroke="${INK}" stroke-width="6"/></g>` +
      `<g data-sink="tank"><rect x="${x0 - 92}" y="${ty - 50}" width="84" height="100" rx="12" fill="#BFD8FF" stroke="${INK}" stroke-width="6"/></g>`;
  // The four pieces to choose from, under the board.
  const slot = 200;
  pieces.forEach((piece, index) => {
    const cx = (W + 4 * slot) / 2 - slot / 2 - index * slot;
    const cy = 540;
    body +=
      `<g data-choice="${LETTERS[index]}"><rect x="${cx - 56}" y="${cy - 56}" width="112" height="112" rx="14" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
      pieceSvg(piece, cx, cy, 112, colour) +
      letterBadge(LETTERS[index], cx + 68, cy - 60, 26) +
      `</g>`;
  });
  return {
    familyKey: 'last-pipe-piece',
    variantKey,
    variant: `${variantKey}:${gap.x},${gap.y}:${right}`,
    prompt: wire
      ? 'أي قطعة تكمّل السلك وتشغّل اللمبة؟'
      : 'أي قطعة تكمّل الأنبوب ويوصل الماي للخزان؟',
    ...lettered(correct),
    distractorRationale: pieces
      .map((piece, index) => ({ piece, index }))
      .filter(({ index }) => index !== correct)
      .map(({ piece, index }) => ({
        optionId: ['a', 'b', 'c', 'd'][index],
        why: `Piece ${piece} leaves the gap open on a side the pipe needs (${right}).`,
      })),
    altText: wire
      ? 'سلك ناقص قطعة بين بطارية ولمبة، وأربع قطع تحت'
      : 'أنبوب ناقص قطعة بين حنفية وخزان، وأربع قطع تحت',
    concept:
      'Find the one piece whose two ends meet both neighbours of the gap.',
    factualClaim: `The gap at ${gap.x},${gap.y} needs the ${right} piece.`,
    svg: frame(body),
  };
}

// ---------------------------------------------------------------------------
// «الشاهد الكذاب» — every door tried
// ---------------------------------------------------------------------------

interface Claim {
  text: string;
  holds: (door: number) => boolean;
}

const claimPool = (doors: number): Claim[] => {
  const pool: Claim[] = [];
  for (let d = 1; d <= doors; d += 1) {
    pool.push({ text: `الكنز خلف الباب ${d}`, holds: (t) => t === d });
    pool.push({ text: `الكنز مو خلف الباب ${d}`, holds: (t) => t !== d });
  }
  pool.push({ text: 'رقم باب الكنز زوجي', holds: (t) => t % 2 === 0 });
  pool.push({ text: 'رقم باب الكنز فردي', holds: (t) => t % 2 === 1 });
  for (let d = 1; d < doors; d += 1) {
    pool.push({ text: `رقم باب الكنز أكبر من ${d}`, holds: (t) => t > d });
  }
  return pool;
};

/** The doors that leave exactly the stated number of guards lying. */
export function doorsThatFit(
  claims: readonly Claim[],
  doors: number,
  liars: number,
): number[] {
  return Array.from({ length: doors }, (_, i) => i + 1).filter(
    (door) => claims.filter((claim) => !claim.holds(door)).length === liars,
  );
}

function composeLyingGuard(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`lying-guard:${variantKey}:${seed}`);
  const doors = 4;
  const guards = variantKey === 'four-guards' ? 4 : 3;
  const liars = variantKey === 'one-honest' ? guards - 1 : 1;
  for (;;) {
    const claims = shuffled(claimPool(doors), random).slice(0, guards);
    const fit = doorsThatFit(claims, doors, liars);
    if (fit.length !== 1) continue;
    // Not settled by one claim alone: no guard simply names the door and is believed.
    const answer = fit[0];
    const options = [1, 2, 3, 4].map((d, index) => ({
      id: ['a', 'b', 'c', 'd'][index],
      label: `الباب ${d}`,
    }));
    const correctOptionId = options[answer - 1].id;
    let body = '';
    const width = guards === 4 ? 270 : 340;
    claims.forEach((claim, index) => {
      const cx = W / 2 + ((guards - 1) / 2 - index) * (width + 14);
      body +=
        `<g data-guard="${index + 1}"><rect x="${round(cx - width / 2)}" y="60" width="${width}" height="150" rx="24" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
        text(claim.text, cx, 148, guards === 4 ? 24 : 28) +
        `<path d="M ${round(cx - 16)} 208 l 16 30 l 16 -30 z" fill="#FFFFFF" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
        `<circle cx="${round(cx)}" cy="290" r="36" fill="#F2C9A0" stroke="${INK}" stroke-width="6"/>` +
        `<path d="M ${round(cx - 56)} 400 q 0 -74 56 -74 q 56 0 56 74 z" fill="${index % 2 ? BLUE : '#2FA866'}" stroke="${INK}" stroke-width="6"/>` +
        text(`الحارس ${index + 1}`, cx, 446, 28) +
        `</g>`;
    });
    for (let d = 1; d <= doors; d += 1) {
      const cx = W / 2 + (2.5 - d) * 150;
      body +=
        `<g data-door="${d}"><rect x="${cx - 50}" y="490" width="100" height="160" rx="14" fill="#8A5A2B" stroke="${INK}" stroke-width="6"/>` +
        `<circle cx="${cx + 28}" cy="575" r="8" fill="${GOLD}"/>` +
        text(String(d), cx, 548, 44, '#FFFFFF') +
        `</g>`;
    }
    const rule =
      liars === 1 ? 'واحد بس من الحراس يكذب' : 'واحد بس من الحراس صادق';
    return {
      familyKey: 'lying-guard',
      variantKey,
      variant: `${variantKey}:${claims.map((c) => c.text).join(' | ')}`,
      prompt: `${rule}، والكنز خلف باب واحد. وينه؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option, index) => ({
          optionId: option.id,
          why: `With the treasure there, the number of lying guards is not ${liars}.`,
        })),
      altText: `${guards} حراس كل واحد يقول جملة، وأربعة أبواب`,
      concept:
        'Try each door and keep the one that leaves exactly the stated number of guards lying.',
      factualClaim: `Only door ${answer} leaves exactly ${liars} guard(s) lying.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الميزان الكذاب» — every set of weights tried
// ---------------------------------------------------------------------------

type Pan = number[]; // counts of each shape
interface Scale {
  left: Pan;
  right: Pan;
  /** -1 left side down, 0 level, 1 right side down. */
  tilt: number;
}

const weigh = (pan: Pan, weights: number[]) =>
  pan.reduce((sum, count, index) => sum + count * weights[index], 0);
const tiltOf = (scale: Scale, weights: number[]) =>
  Math.sign(weigh(scale.right, weights) - weigh(scale.left, weights));

const WEIGHT_SETS: number[][] = (() => {
  const sets: number[][] = [];
  for (let a = 1; a <= 6; a += 1)
    for (let b = 1; b <= 6; b += 1)
      for (let c = 1; c <= 6; c += 1) sets.push([a, b, c]);
  return sets;
})();

/** The scales that, set aside, leave the others true for some weights. */
export function scalesThatCanLie(scales: readonly Scale[]): number[] {
  return scales
    .map((_, k) => k)
    .filter((k) =>
      WEIGHT_SETS.some((weights) =>
        scales.every(
          (scale, i) => i === k || tiltOf(scale, weights) === scale.tilt,
        ),
      ),
    );
}

const SHAPE_DRAW = [
  (x: number, y: number) =>
    `<circle data-shape="circle" cx="${round(x)}" cy="${round(y)}" r="19" fill="${RED}" stroke="${INK}" stroke-width="4"/>`,
  (x: number, y: number) =>
    `<path data-shape="triangle" d="M ${round(x)} ${round(y - 21)} l 22 38 l -44 0 z" fill="${GOLD}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
  (x: number, y: number) =>
    `<rect data-shape="square" x="${round(x - 18)}" y="${round(y - 18)}" width="36" height="36" fill="${BLUE}" stroke="${INK}" stroke-width="4"/>`,
];

function scaleSvg(scale: Scale, cx: number, cy: number, label: string): string {
  const arm = 150;
  const drop = 26 * scale.tilt; // right side down when positive
  const lx = cx - arm;
  const rx = cx + arm;
  const ly = cy - drop;
  const ry = cy + drop;
  const pan = (x: number, y: number, contents: Pan) => {
    const shapes = contents.flatMap((count, index) =>
      Array.from({ length: count }, () => index),
    );
    let out = `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x - 58)}" y2="${round(y + 62)}" stroke="${INK}" stroke-width="3"/><line x1="${round(x)}" y1="${round(y)}" x2="${round(x + 58)}" y2="${round(y + 62)}" stroke="${INK}" stroke-width="3"/>`;
    out += `<path d="M ${round(x - 70)} ${round(y + 62)} q 70 34 140 0 z" fill="#C9C2B4" stroke="${INK}" stroke-width="5"/>`;
    shapes.forEach((shape, i) => {
      const sx = x - (shapes.length - 1) * 23 + i * 46;
      out += SHAPE_DRAW[shape](sx, y + 40);
    });
    return out;
  };
  return (
    `<g data-scale="${label}" data-tilt="${scale.tilt}">` +
    `<path d="M ${cx - 46} ${cy + 140} l 46 -12 l 46 12 z" fill="${INK}"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + 130}" stroke="${INK}" stroke-width="10"/>` +
    `<line x1="${round(lx)}" y1="${round(ly)}" x2="${round(rx)}" y2="${round(ry)}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="10" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>` +
    pan(lx, ly, scale.left) +
    pan(rx, ry, scale.right) +
    letterBadge(label, cx, cy - 46, 26) +
    `</g>`
  );
}

function composeFalseScale(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`false-scale:${variantKey}:${seed}`);
  const randomPan = (): Pan => {
    for (;;) {
      const pan = [0, 0, 0].map(() => Math.floor(random() * 3));
      const total = pan.reduce((a, b) => a + b, 0);
      if (total >= 1 && total <= 3) return pan;
    }
  };
  for (;;) {
    const weights = shuffled([1, 2, 3, 4, 5, 6], random).slice(0, 3);
    const scales: Scale[] = [];
    while (scales.length < 4) {
      const left = randomPan();
      const right = randomPan();
      if (left.every((count, i) => count === right[i])) continue;
      const scale = { left, right, tilt: 0 };
      scale.tilt = tiltOf(scale, weights);
      scales.push(scale);
    }
    if (variantKey === 'level-trap' && !scales.some((s) => s.tilt === 0))
      continue;
    const liar = Math.floor(random() * 4);
    const truth = scales[liar].tilt;
    const lies = [-1, 0, 1].filter((tilt) => tilt !== truth);
    scales[liar] = {
      ...scales[liar],
      tilt:
        variantKey === 'level-trap' && lies.includes(0)
          ? 0
          : pick(lies, random),
    };
    const can = scalesThatCanLie(scales);
    if (can.length !== 1 || can[0] !== liar) continue;
    let body = '';
    scales.forEach((scale, index) => {
      const cx = index % 2 === 0 ? W / 2 + 280 : W / 2 - 280;
      const cy = index < 2 ? 150 : 455;
      body += scaleSvg(scale, cx, cy - 30, LETTERS[index]);
    });
    return {
      familyKey: 'false-scale',
      variantKey,
      variant: `${variantKey}:${weights.join(',')}:${liar}`,
      prompt:
        'كل شكل له نفس الوزن في كل الموازين، وميزان واحد بس كذاب. أي واحد؟',
      ...lettered(liar),
      distractorRationale: [0, 1, 2, 3]
        .filter((index) => index !== liar)
        .map((index) => ({
          optionId: ['a', 'b', 'c', 'd'][index],
          why: 'Set aside, the other three scales still contradict each other.',
        })),
      altText: 'أربع موازين عليها دوائر ومثلثات ومربعات، وواحد منها مايل غلط',
      concept:
        'Find the one balance whose tilt cannot agree with the other three for any weights.',
      factualClaim: `Weights ${weights.join('/')} (circle/triangle/square); scale ${LETTERS[liar]} is drawn wrong and is the only one that can be.`,
      svg: frame(body),
    };
  }
}

export function composeRyo(
  familyKey: RyoFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  switch (familyKey) {
    case 'mirror-beam':
      return composeMirrorBeam(seed, variantKey);
    case 'last-pipe-piece':
      return composeLastPipe(seed, variantKey);
    case 'lying-guard':
      return composeLyingGuard(seed, variantKey);
    default:
      return composeFalseScale(seed, variantKey);
  }
}
