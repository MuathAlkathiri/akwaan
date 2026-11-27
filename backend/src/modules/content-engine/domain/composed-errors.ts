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
 * اكتشف الخطأ, إكس أو: a drawing that follows a rule everywhere but once.
 * The engine proves the rule is read off the rest: set aside any other tile
 * and no rule of the family fits what is left.
 */
export const ERRORS_VARIANTS = {
  'broken-rule-step': ['two-rules', 'three-rules'],
  'broken-grid-pattern': ['rows-and-columns', 'diagonal', 'mirror'],
} as const;

export type ErrorsFamily = keyof typeof ERRORS_VARIANTS;

const COLOURS = [RED, '#2F6FE0', '#2FA866', GOLD];
const COLOUR_KEYS = ['red', 'blue', 'green', 'yellow'];

const text = (value: string, x: number, y: number, size: number): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${INK}">${value}</text>`;

const polygon = (
  sides: number,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  fill: string,
): string => {
  const points = Array.from({ length: sides }, (_, k) => {
    const a = ((angle - 90) * Math.PI) / 180 + (k * 2 * Math.PI) / sides;
    return `${round(cx + r * Math.cos(a))},${round(cy + r * Math.sin(a))}`;
  }).join(' ');
  return `<polygon points="${points}" fill="${fill}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
};

// ---------------------------------------------------------------------------
// «أي خطوة كسرت القانون؟»
// ---------------------------------------------------------------------------

export interface Step {
  sides: number;
  colour: number;
  angle: number;
}

interface Law {
  sides0: number;
  sidesStep: number;
  colour0: number;
  colourCycle: number; // 1 = the same colour throughout
  angle0: number;
  angleStep: number;
}

const stepOf = (law: Law, k: number): Step => ({
  sides: law.sides0 + k * law.sidesStep,
  colour:
    law.colourCycle === 1 ? law.colour0 : (law.colour0 + k) % law.colourCycle,
  angle: (((law.angle0 + k * law.angleStep) % 360) + 360) % 360,
});

/** A polygon's turn matters only up to its own symmetry. */
const sameTurn = (sides: number, a: number, b: number): boolean => {
  const period = 360 / sides;
  const d = (((a - b) % period) + period) % period;
  return d < 1e-6 || period - d < 1e-6;
};

const sameStep = (a: Step, b: Step): boolean =>
  a.sides === b.sides &&
  a.colour === b.colour &&
  sameTurn(a.sides, a.angle, b.angle);

const LAWS: Law[] = (() => {
  const laws: Law[] = [];
  for (const sides0 of [3, 4, 5])
    for (const sidesStep of [0, 1])
      for (const colourCycle of [1, 2, 3])
        for (
          let colour0 = 0;
          colour0 < (colourCycle === 1 ? 4 : colourCycle);
          colour0 += 1
        )
          for (const angle0 of [0, 15, 30, 45])
            for (const angleStep of [0, 30, 45, 90])
              laws.push({
                sides0,
                sidesStep,
                colour0,
                colourCycle,
                angle0,
                angleStep,
              });
  return laws;
})();

/** The steps that, set aside, leave a row some law of the family explains. */
export function stepsThatCanBreak(steps: readonly Step[]): number[] {
  return steps
    .map((_, i) => i)
    .filter((i) =>
      LAWS.some((law) =>
        steps.every((step, k) => k === i || sameStep(step, stepOf(law, k))),
      ),
    );
}

function composeBrokenRule(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`broken-rule-step:${variantKey}:${seed}`);
  const three = variantKey === 'three-rules';
  for (;;) {
    const law: Law = {
      sides0: pick([3, 4], random),
      sidesStep: three ? 1 : pick([0, 1], random),
      colour0: 0,
      colourCycle: pick([2, 3], random),
      angle0: 0,
      angleStep: pick([30, 45, 90], random),
    };
    if (!three && law.sidesStep === 1 && random() < 0.5) law.angleStep = 0;
    const steps = Array.from({ length: 5 }, (_, k) => stepOf(law, k));
    const broken = 1 + Math.floor(random() * 3); // 2nd to 4th
    const original = steps[broken];
    const attribute = pick(['sides', 'colour', 'angle'] as const, random);
    const changed = { ...original };
    if (attribute === 'sides') changed.sides += pick([-1, 1], random);
    if (attribute === 'colour')
      changed.colour = (changed.colour + 1 + Math.floor(random() * 2)) % 3;
    if (attribute === 'angle')
      changed.angle = (changed.angle + pick([45, 90, 135], random)) % 360;
    if (changed.sides < 3 || changed.sides > 8 || sameStep(changed, original))
      continue;
    steps[broken] = changed;
    const can = stepsThatCanBreak(steps);
    if (can.length !== 1 || can[0] !== broken) continue;
    // Four of the five offered: the broken one and three that keep the law.
    const offered = shuffled(
      [
        broken,
        ...shuffled(
          [0, 1, 2, 3, 4].filter((i) => i !== broken),
          random,
        ).slice(0, 3),
      ],
      random,
    ).sort((a, b) => a - b);
    const options = offered.map((index, k) => ({
      id: ['a', 'b', 'c', 'd'][k],
      label: `الخطوة ${index + 1}`,
    }));
    const correctOptionId = options[offered.indexOf(broken)].id;
    let body = '';
    const slot = 210;
    steps.forEach((step, k) => {
      const cx = (W + 5 * slot) / 2 - slot / 2 - k * slot;
      body +=
        `<g data-step="${k + 1}" data-sides="${step.sides}" data-colour="${COLOUR_KEYS[step.colour]}" data-angle="${step.angle}">` +
        `<rect x="${cx - 90}" y="190" width="180" height="180" rx="24" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
        polygon(step.sides, cx, 282, 66, step.angle, COLOURS[step.colour]) +
        // A notch shows which way the shape is turned.
        `<circle cx="${round(cx + 66 * Math.sin((step.angle * Math.PI) / 180))}" cy="${round(282 - 66 * Math.cos((step.angle * Math.PI) / 180))}" r="9" fill="${INK}"/>` +
        text(String(k + 1), cx, 440, 48) +
        `</g>`;
      if (k < 4) {
        body += `<path d="M ${cx - 96} 282 l -18 0 m 8 -10 l -10 10 l 10 10" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      }
    });
    return {
      familyKey: 'broken-rule-step',
      variantKey,
      variant: `${variantKey}:${broken + 1}:${attribute}`,
      prompt:
        'الأشكال تمشي على قانون من اليمين لليسار، وخطوة وحدة كسرته. أي خطوة؟',
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'This step keeps the law the other steps share.',
        })),
      altText: 'خمس أشكال مرقمة في صف، تتغير أضلاعها ولونها ودورانها',
      concept:
        'Read the law of a row of shapes from the steps that keep it, and find the one that breaks it.',
      factualClaim: `Step ${broken + 1} breaks the law in its ${attribute}; it is the only step that, set aside, leaves the rest lawful.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «وين الخلل في النمط؟»
// ---------------------------------------------------------------------------

export interface Tile {
  shape: number; // sides: 3, 4 or 0 for a circle
  colour: number;
}

const SHAPES = [0, 3, 4, 6];
const N = 4;

type Grid = Tile[][];

const tileSvg = (tile: Tile, cx: number, cy: number): string =>
  tile.shape === 0
    ? `<circle cx="${round(cx)}" cy="${round(cy)}" r="34" fill="${COLOURS[tile.colour]}" stroke="${INK}" stroke-width="6"/>`
    : polygon(
        tile.shape,
        cx,
        cy,
        38,
        tile.shape === 4 ? 45 : 0,
        COLOURS[tile.colour],
      );

const sameTile = (a: Tile, b: Tile) =>
  a.shape === b.shape && a.colour === b.colour;

/** Grids of the family's kind that agree with every square but one. */
function lawful(
  variantKey: string,
  grid: Grid,
  skip: [number, number],
): boolean {
  const cells = (fn: (r: number, c: number) => Tile) =>
    grid.every((row, r) =>
      row.every(
        (tile, c) =>
          (r === skip[0] && c === skip[1]) || sameTile(tile, fn(r, c)),
      ),
    );
  if (variantKey === 'mirror') {
    return grid.every((row, r) =>
      row.every(
        (tile, c) =>
          (r === skip[0] && (c === skip[1] || N - 1 - c === skip[1])) ||
          sameTile(tile, row[N - 1 - c]),
      ),
    );
  }
  if (variantKey === 'diagonal') {
    for (const shapes of permutations(SHAPES, 3))
      for (const colours of permutations([0, 1, 2], 3))
        if (
          cells((r, c) => ({
            shape: shapes[(r + c) % 3],
            colour: colours[(r + c) % 3],
          }))
        )
          return true;
    return false;
  }
  for (const shapes of permutations(SHAPES, 4))
    for (const colours of permutations([0, 1, 2, 3], 4))
      if (cells((r, c) => ({ shape: shapes[c], colour: colours[r] })))
        return true;
  return false;
}

function permutations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations(
      items.filter((_, i) => i !== index),
      size - 1,
    ).map((rest) => [item, ...rest]),
  );
}

export function squaresThatCanBreak(
  variantKey: string,
  grid: Grid,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < N; r += 1)
    for (let c = 0; c < N; c += 1)
      if (lawful(variantKey, grid, [r, c])) out.push([r, c]);
  return out;
}

function composeBrokenGrid(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`broken-grid-pattern:${variantKey}:${seed}`);
  for (;;) {
    let grid: Grid;
    if (variantKey === 'mirror') {
      grid = Array.from({ length: N }, () => {
        const half = Array.from({ length: N / 2 }, () => ({
          shape: pick(SHAPES, random),
          colour: Math.floor(random() * 4),
        }));
        return [...half, ...[...half].reverse().map((t) => ({ ...t }))];
      });
    } else if (variantKey === 'diagonal') {
      const shapes = shuffled(SHAPES, random).slice(0, 3);
      const colours = shuffled([0, 1, 2], random);
      grid = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => ({
          shape: shapes[(r + c) % 3],
          colour: colours[(r + c) % 3],
        })),
      );
    } else {
      const shapes = shuffled(SHAPES, random);
      const colours = shuffled([0, 1, 2, 3], random);
      grid = Array.from({ length: N }, (_, r) =>
        Array.from({ length: N }, (_, c) => ({
          shape: shapes[c],
          colour: colours[r],
        })),
      );
    }
    const br = Math.floor(random() * N);
    const bc = Math.floor(random() * N);
    const original = grid[br][bc];
    const changed =
      random() < 0.5
        ? {
            ...original,
            colour: (original.colour + 1 + Math.floor(random() * 3)) % 4,
          }
        : {
            ...original,
            shape: pick(
              SHAPES.filter((s) => s !== original.shape),
              random,
            ),
          };
    grid[br][bc] = changed;
    const can = squaresThatCanBreak(variantKey, grid);
    // In a mirror the twin square is as guilty: offer only one of the pair.
    const guilty = can.filter(
      ([r, c]) => !(variantKey === 'mirror' && r === br && c === N - 1 - bc),
    );
    if (guilty.length !== 1 || guilty[0][0] !== br || guilty[0][1] !== bc)
      continue;
    const others = shuffled(
      Array.from(
        { length: N * N },
        (_, i) => [Math.floor(i / N), i % N] as [number, number],
      ).filter(
        ([r, c]) =>
          !(
            r === br &&
            (c === bc || (variantKey === 'mirror' && c === N - 1 - bc))
          ),
      ),
      random,
    ).slice(0, 3);
    const marked = shuffled([[br, bc] as [number, number], ...others], random);
    const correct = marked.findIndex(([r, c]) => r === br && c === bc);
    const cell = 118;
    const x0 = (W - N * cell) / 2;
    const y0 = 70;
    let body = `<rect x="${x0 - 12}" y="${y0 - 12}" width="${N * cell + 24}" height="${N * cell + 24}" rx="24" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>`;
    if (variantKey === 'mirror') {
      body += `<line x1="${W / 2}" y1="${y0 - 30}" x2="${W / 2}" y2="${y0 + N * cell + 30}" stroke="${RED}" stroke-width="6" stroke-dasharray="14 10"/>`;
    }
    grid.forEach((row, r) =>
      row.forEach((tile, c) => {
        const cx = x0 + c * cell + cell / 2;
        const cy = y0 + r * cell + cell / 2;
        body += `<g data-square="${r},${c}">${tileSvg(tile, cx, cy)}</g>`;
      }),
    );
    marked.forEach(([r, c], k) => {
      body += letterBadge(
        LETTERS[k],
        x0 + c * cell + cell - 16,
        y0 + r * cell + 18,
        20,
      );
    });
    return {
      familyKey: 'broken-grid-pattern',
      variantKey,
      variant: `${variantKey}:${br},${bc}`,
      prompt:
        variantKey === 'mirror'
          ? 'نص اللوحة مراية للنص الثاني إلا مربع واحد. أي واحد؟'
          : 'اللوحة ماشية على نمط إلا مربع واحد. أي واحد؟',
      options: LETTERS.map((label, k) => ({
        id: ['a', 'b', 'c', 'd'][k],
        label,
      })),
      correctOptionId: ['a', 'b', 'c', 'd'][correct],
      distractorRationale: [0, 1, 2, 3]
        .filter((k) => k !== correct)
        .map((k) => ({
          optionId: ['a', 'b', 'c', 'd'][k],
          why: 'This square keeps the pattern the others share.',
        })),
      altText: 'لوحة ٤×٤ من أشكال ملونة، وأربع مربعات عليها حروف',
      concept:
        'Read the pattern from the squares that keep it and find the one that does not.',
      factualClaim: `Square ${br},${bc} breaks the ${variantKey} pattern; no other square can be the one.`,
      svg: frame(body),
    };
  }
}

export function composeErrors(
  familyKey: ErrorsFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  return familyKey === 'broken-rule-step'
    ? composeBrokenRule(seed, variantKey)
    : composeBrokenGrid(seed, variantKey);
}
