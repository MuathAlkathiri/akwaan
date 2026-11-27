import {
  GOLD,
  INK,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  H,
  frame,
  pick,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';

/**
 * القنبلة in الأرقام والتقدير: a small number puzzle a glance sets up and a
 * moment solves. Five templates take two or three seconds; three take five to
 * eight, so they are a third of what the allocator deals (owner decision
 * 2026-11-27): harder, without turning the Bomb into a round of deciders.
 * Every answer is proved by the engine, and every template is checked against
 * the other readings a player might take.
 */
export const NUMBER_BOMB_VARIANTS = [
  'secret-code',
  'secret-code-product',
  'hidden-symbol',
  'domino-gap',
  'fewest-coins',
  'number-grid',
  'mystery-machine',
  'alternating-sequence',
] as const;

export const SLOW_NUMBER_BOMB_VARIANTS = [
  'number-grid',
  'mystery-machine',
  'alternating-sequence',
] as const;

export interface NumberBomb {
  variantKey: string;
  variant: string;
  prompt: string;
  answer: number;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

const BLUE = '#2F6FE0';
const GREEN = '#2FA866';

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

/** A latin numeral run left to right, as numbers are written in Arabic too. */
const ltr = (value: string): string => `⁦${value}⁩`;

const card = (x: number, y: number, w: number, h: number, fill = '#FFFFFF') =>
  `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="22" fill="${fill}" stroke="${INK}" stroke-width="7"/>`;

// ---------------------------------------------------------------------------
// «الرمز السري»
// ---------------------------------------------------------------------------

interface Hint {
  text: string;
  holds: (tens: number, units: number) => boolean;
}

/** Every two-digit code the hints allow. */
export function codesThatFit(hints: readonly Hint[]): number[] {
  const out: number[] = [];
  for (let code = 10; code <= 99; code += 1) {
    const tens = Math.floor(code / 10);
    const units = code % 10;
    if (hints.every((hint) => hint.holds(tens, units))) out.push(code);
  }
  return out;
}

function secretCode(random: () => number, product: boolean): NumberBomb {
  for (;;) {
    const tens = 1 + Math.floor(random() * 9);
    const units = Math.floor(random() * 10);
    if (tens === units) continue;
    const diff = tens - units;
    const first: Hint = product
      ? {
          text: `حاصل ضرب الرقمين = ${tens * units}`,
          holds: (a, b) => a * b === tens * units,
        }
      : {
          text: `مجموع الرقمين = ${tens + units}`,
          holds: (a, b) => a + b === tens + units,
        };
    const second: Hint =
      diff > 0
        ? {
            text: `الأول أكبر من الثاني بـ${diff}`,
            holds: (a, b) => a - b === diff,
          }
        : {
            text: `الثاني أكبر من الأول بـ${-diff}`,
            holds: (a, b) => b - a === -diff,
          };
    if (product && tens * units === 0) continue;
    const fit = codesThatFit([first, second]);
    if (fit.length !== 1 || fit[0] !== tens * 10 + units) continue;
    let body =
      // The lock.
      `<path d="M 470 250 v -60 a 130 130 0 0 1 260 0 v 60" fill="none" stroke="${INK}" stroke-width="26"/>` +
      `<rect x="400" y="240" width="400" height="220" rx="36" fill="${GOLD}" stroke="${INK}" stroke-width="10"/>`;
    for (const [index, x] of [520, 680].entries()) {
      body +=
        `<rect data-digit="${index}" x="${x - 58}" y="290" width="116" height="120" rx="18" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>` +
        text('؟', x, 375, 70);
    }
    [first, second].forEach((hint, index) => {
      const y = 500 + index * 80;
      body += card(260, y, 680, 64) + text(hint.text, 600, y + 45, 34);
    });
    const code = tens * 10 + units;
    return {
      variantKey: product ? 'secret-code-product' : 'secret-code',
      variant: `${product ? 'product' : 'sum'}:${code}`,
      prompt: 'وش الرمز اللي يفتح القفل؟',
      answer: code,
      altText: 'قفل برمز من خانتين وتلميحين تحته',
      concept: 'Find the one two-digit code both hints allow.',
      factualClaim: `Only ${code} fits: ${first.text}; ${second.text}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الميزان المجهول»
// ---------------------------------------------------------------------------

const SYMBOLS = [
  (cx: number, cy: number) =>
    `<circle cx="${cx}" cy="${cy}" r="30" fill="${RED}" stroke="${INK}" stroke-width="6"/>`,
  (cx: number, cy: number) =>
    `<rect x="${cx - 28}" y="${cy - 28}" width="56" height="56" fill="${BLUE}" stroke="${INK}" stroke-width="6"/>`,
  (cx: number, cy: number) =>
    `<path d="M ${cx} ${cy - 32} l 34 58 l -68 0 z" fill="${GREEN}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
];

function hiddenSymbol(random: () => number): NumberBomb {
  const [a, b] = shuffled([0, 1, 2], random);
  const va = 2 + Math.floor(random() * 8);
  let vb = 2 + Math.floor(random() * 9);
  if (vb === va) vb += 1;
  const rows: Array<{ symbols: number[]; total: string }> = [
    { symbols: [a, a], total: String(2 * va) },
    { symbols: [a, b], total: String(va + vb) },
    { symbols: [b], total: '؟' },
  ];
  let body = '';
  rows.forEach((row, index) => {
    const y = 140 + index * 170;
    body += card(300, y - 70, 600, 140, index === 2 ? '#FFF4D6' : '#FFFFFF');
    // Right to left: the symbols, then «=», then the total.
    let x = 820;
    row.symbols.forEach((symbol, k) => {
      if (k > 0) {
        body += text('+', x + 55, y + 16, 52);
      }
      body += SYMBOLS[symbol](x, y);
      x -= 110;
    });
    body += text('=', 520, y + 18, 56) + text(ltr(row.total), 410, y + 22, 64);
  });
  return {
    variantKey: 'hidden-symbol',
    variant: `${a}${b}:${va},${vb}`,
    prompt: 'كم قيمة آخر شكل؟',
    answer: vb,
    altText: 'ثلاث بطاقات فيها أشكال ومجموعها، والأخيرة مجهولة',
    concept:
      'Read one symbol from the first card, then the other from the second.',
    factualClaim: `First symbol ${va}, so the second is ${va + vb} − ${va} = ${vb}.`,
    svg: frame(body),
  };
}

// ---------------------------------------------------------------------------
// «الدومينو الناقص»
// ---------------------------------------------------------------------------

const PIPS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

const half = (pips: number | null, cx: number, cy: number, s: number) =>
  pips === null
    ? text('؟', cx, cy + 26, 72, RED)
    : PIPS[pips]
        .map(
          ([dx, dy]) =>
            `<circle cx="${round(cx + dx * s * 0.27)}" cy="${round(cy + dy * s * 0.27)}" r="${round(s * 0.09)}" fill="${INK}"/>`,
        )
        .join('');

function dominoGap(random: () => number): NumberBomb {
  for (;;) {
    const total = 5 + Math.floor(random() * 6); // 5..10
    const tops = shuffled(
      [0, 1, 2, 3, 4, 5, 6].filter(
        (top) => total - top >= 0 && total - top <= 6,
      ),
      random,
    ).slice(0, 4);
    if (tops.length < 4) continue;
    const tiles = tops.map((top) => [top, total - top]);
    const last = tiles[3];
    const s = 120;
    let body = '';
    tiles.forEach(([top, bottom], index) => {
      const cx = W / 2 + (1.5 - index) * 200;
      const y = 120;
      body +=
        `<g data-tile="${index}">${card(cx - s / 2, y, s, 2 * s + 10)}` +
        `<line x1="${cx - s / 2 + 12}" y1="${y + s + 5}" x2="${cx + s / 2 - 12}" y2="${y + s + 5}" stroke="${INK}" stroke-width="6"/>` +
        half(top, cx, y + s / 2, s) +
        half(index === 3 ? null : bottom, cx, y + s * 1.5 + 10, s) +
        `</g>`;
    });
    return {
      variantKey: 'domino-gap',
      variant: `${total}:${tops.join(',')}`,
      prompt: 'كل القطع نفس المجموع. كم نقطة في المكان الفاضي؟',
      answer: last[1],
      altText: 'أربع قطع دومينو، والأخيرة ناقص نصها',
      concept:
        'Read the shared total of the dominoes and complete the last one.',
      factualClaim: `Every tile sums to ${total}; the last is ${last[0]} + ${last[1]}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «أقل عدد من القطع»
// ---------------------------------------------------------------------------

const COIN_SETS = [
  [1, 3, 4],
  [1, 4, 5],
  [1, 5, 6],
  [1, 3, 5],
  [1, 2, 5],
  [1, 4, 6],
];

export function fewestCoins(coins: readonly number[], target: number): number {
  const best = Array(target + 1).fill(Infinity);
  best[0] = 0;
  for (let t = 1; t <= target; t += 1) {
    for (const coin of coins) {
      if (coin <= t) best[t] = Math.min(best[t], best[t - coin] + 1);
    }
  }
  return best[target];
}

const greedyCoins = (coins: readonly number[], target: number): number => {
  let left = target;
  let count = 0;
  for (const coin of [...coins].sort((a, b) => b - a)) {
    count += Math.floor(left / coin);
    left %= coin;
  }
  return count;
};

function fewestCoinsPuzzle(random: () => number): NumberBomb {
  for (;;) {
    const coins = pick(COIN_SETS, random);
    const target = 6 + Math.floor(random() * 10);
    const answer = fewestCoins(coins, target);
    // Mostly a target where the biggest coin first is not the best.
    const trap = greedyCoins(coins, target) > answer;
    if (!trap && random() < 0.75) continue;
    if (answer < 2 || answer > 4) continue;
    let body = '';
    coins.forEach((coin, index) => {
      const cx = W / 2 + (1 - index) * 220;
      body +=
        `<g data-coin="${coin}"><circle cx="${cx}" cy="230" r="86" fill="${GOLD}" stroke="${INK}" stroke-width="9"/>` +
        `<circle cx="${cx}" cy="230" r="66" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="6 8"/>` +
        text(ltr(String(coin)), cx, 258, 76) +
        `</g>`;
    });
    body +=
      card(400, 400, 400, 150, '#FFF4D6') +
      text('المطلوب', 600, 455, 34) +
      text(ltr(String(target)), 600, 528, 64, RED);
    return {
      variantKey: 'fewest-coins',
      variant: `${coins.join(',')}:${target}`,
      prompt: 'تقدر تكرر أي قطعة. أقل عدد قطع تجمع فيها المطلوب؟',
      answer,
      altText: 'ثلاث قطع نقدية بقيم مختلفة ومبلغ مطلوب',
      concept:
        'Find the fewest coins that make the sum, not the first sum that works.',
      factualClaim: `With ${coins.join('/')}, ${target} takes at least ${answer} coins (biggest first takes ${greedyCoins(coins, target)}).`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الرقم المفقود» — a 4×4 grid, 1 to 4 once in every row and column
// ---------------------------------------------------------------------------

type Grid = Array<Array<number | null>>;

/** How many ways the grid can be completed, stopping at two. */
export function completions(grid: Grid): number {
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if (grid[r][c] !== null) continue;
      let count = 0;
      for (let v = 1; v <= 4; v += 1) {
        if (grid[r].includes(v) || grid.some((row) => row[c] === v)) continue;
        grid[r][c] = v;
        count += completions(grid);
        grid[r][c] = null;
        if (count > 1) return count;
      }
      return count;
    }
  }
  return 1;
}

function numberGrid(random: () => number): NumberBomb {
  for (;;) {
    const symbols = shuffled([1, 2, 3, 4], random);
    const rows = shuffled([0, 1, 2, 3], random);
    const cols = shuffled([0, 1, 2, 3], random);
    const full = rows.map((r) => cols.map((c) => symbols[(r + c) % 4]));
    const grid: Grid = full.map((row) => [...row]);
    const tr = Math.floor(random() * 4);
    const tc = Math.floor(random() * 4);
    // Empty the asked square, and enough others that neither its row nor its
    // column gives it away alone.
    grid[tr][tc] = null;
    for (const [r, c] of shuffled(
      Array.from({ length: 16 }, (_, i) => [Math.floor(i / 4), i % 4]),
      random,
    )) {
      if (r === tr && c === tc) continue;
      const before = grid[r][c];
      grid[r][c] = null;
      if (completions(grid.map((row) => [...row])) !== 1) grid[r][c] = before;
      const rowBlanks = grid[tr].filter((v) => v === null).length;
      const colBlanks = grid.filter((row) => row[tc] === null).length;
      if (
        rowBlanks >= 2 &&
        colBlanks >= 2 &&
        grid.flat().filter((v) => v === null).length >= 7
      )
        break;
    }
    const rowBlanks = grid[tr].filter((v) => v === null).length;
    const colBlanks = grid.filter((row) => row[tc] === null).length;
    if (rowBlanks < 2 || colBlanks < 2) continue;
    if (completions(grid.map((row) => [...row])) !== 1) continue;
    const cell = 120;
    const x0 = (W - 4 * cell) / 2;
    const y0 = (H - 4 * cell) / 2;
    let body = card(x0 - 14, y0 - 14, 4 * cell + 28, 4 * cell + 28);
    grid.forEach((row, r) =>
      row.forEach((value, c) => {
        const x = x0 + c * cell;
        const y = y0 + r * cell;
        const asked = r === tr && c === tc;
        body +=
          `<rect data-square="${r},${c}" x="${x + 6}" y="${y + 6}" width="${cell - 12}" height="${cell - 12}" rx="12" fill="${asked ? '#FFF4D6' : '#F3EFE6'}" stroke="${asked ? RED : '#C9C2B4'}" stroke-width="${asked ? 7 : 3}"/>` +
          (value !== null
            ? text(ltr(String(value)), x + cell / 2, y + cell / 2 + 22, 60)
            : asked
              ? text('؟', x + cell / 2, y + cell / 2 + 24, 66, RED)
              : '');
      }),
    );
    return {
      variantKey: 'number-grid',
      variant: `${tr},${tc}:${grid.map((row) => row.map((v) => v ?? '.').join('')).join('/')}`,
      prompt: 'ما يتكرر رقم في صف ولا عمود. وش الرقم مكان علامة الاستفهام؟',
      answer: full[tr][tc],
      altText: 'شبكة ٤×٤ فيها أرقام وفراغات، وفراغ معلّم بعلامة استفهام',
      concept:
        'Complete a small Latin square far enough to fix the marked square.',
      factualClaim: `The grid has one completion; the marked square is ${full[tr][tc]}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الآلة الغامضة» — accepted only when every rule that fits agrees
// ---------------------------------------------------------------------------

interface Rule {
  name: string;
  apply: (x: number) => number;
}

const RULES: Rule[] = (() => {
  const rules: Rule[] = [];
  for (let a = 1; a <= 5; a += 1)
    for (let b = -10; b <= 10; b += 1)
      rules.push({
        name: `${a}x${b >= 0 ? '+' : ''}${b}`,
        apply: (x) => a * x + b,
      });
  for (let b = -5; b <= 5; b += 1)
    rules.push({ name: `x²${b >= 0 ? '+' : ''}${b}`, apply: (x) => x * x + b });
  rules.push({ name: 'x(x+1)', apply: (x) => x * (x + 1) });
  rules.push({ name: 'x(x−1)', apply: (x) => x * (x - 1) });
  for (let k = 2; k <= 3; k += 1)
    rules.push({ name: `x^${k}`, apply: (x) => x ** k });
  return rules;
})();

/** What every rule that fits the examples gives for the question. */
export function machineAnswers(
  examples: ReadonlyArray<[number, number]>,
  input: number,
): number[] {
  return [
    ...new Set(
      RULES.filter((rule) =>
        examples.every(([x, y]) => rule.apply(x) === y),
      ).map((rule) => rule.apply(input)),
    ),
  ];
}

function mysteryMachine(random: () => number): NumberBomb {
  for (;;) {
    const rule = pick(
      RULES.filter((r) => !r.name.startsWith('1x')),
      random,
    );
    const inputs = shuffled([1, 2, 3, 4, 5, 6, 7], random).slice(0, 4);
    const examples = inputs
      .slice(0, 3)
      .map((x) => [x, rule.apply(x)] as [number, number]);
    const input = inputs[3];
    const answer = rule.apply(input);
    if (answer < 0 || answer > 99 || examples.some(([, y]) => y < 0 || y > 99))
      continue;
    const agreed = machineAnswers(examples, input);
    if (agreed.length !== 1 || agreed[0] !== answer) continue;
    let body =
      `<rect x="470" y="120" width="260" height="430" rx="30" fill="${BLUE}" stroke="${INK}" stroke-width="10"/>` +
      `<circle cx="600" cy="210" r="44" fill="${GOLD}" stroke="${INK}" stroke-width="8"/>` +
      `<path d="M 600 210 l 26 -20" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>` +
      text('؟', 600, 400, 110, '#FFFFFF');
    [...examples, [input, null] as [number, number | null]].forEach(
      ([x, y], index) => {
        const cy = 160 + index * 115;
        body +=
          card(800, cy - 44, 200, 88) +
          text(ltr(String(x)), 900, cy + 22, 56) +
          `<path d="M 790 ${cy} l -50 0 m 14 -14 l -14 14 l 14 14" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>` +
          card(200, cy - 44, 200, 88, y === null ? '#FFF4D6' : '#FFFFFF') +
          text(
            y === null ? '؟' : ltr(String(y)),
            300,
            cy + 22,
            56,
            y === null ? RED : INK,
          ) +
          `<path d="M 460 ${cy} l -50 0 m 14 -14 l -14 14 l 14 14" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      },
    );
    body += text('يدخل', 900, 90, 30) + text('يطلع', 300, 90, 30);
    return {
      variantKey: 'mystery-machine',
      variant: `${rule.name}:${input}`,
      prompt: 'الآلة تغيّر كل رقم بنفس القاعدة. وش يطلع آخر واحد؟',
      answer,
      altText: 'آلة يدخلها رقم ويطلع رقم ثاني، ثلاث أمثلة ورابع مجهول',
      concept: 'Find the rule from three examples and apply it once more.',
      factualClaim: `Rule ${rule.name}: ${examples.map(([x, y]) => `${x}→${y}`).join(', ')}, so ${input}→${answer}; every rule of the family that fits gives ${answer}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «السلسلة المتناوبة»
// ---------------------------------------------------------------------------

/** Next terms every simple rule that fits the shown terms would give. */
export function sequenceAnswers(terms: readonly number[]): number[] {
  const next = new Set<number>();
  const n = terms.length;
  const d = terms.map((t, i) => (i ? t - terms[i - 1] : 0)).slice(1);
  // A constant step.
  if (d.every((x) => x === d[0])) next.add(terms[n - 1] + d[0]);
  // Two steps taken in turn.
  if (d.every((x, i) => x === d[i % 2]))
    next.add(terms[n - 1] + d[(n - 1) % 2]);
  // Steps that grow by a constant.
  const dd = d.slice(1).map((x, i) => x - d[i]);
  if (dd.every((x) => x === dd[0]))
    next.add(terms[n - 1] + d[d.length - 1] + dd[0]);
  // Two interleaved runs, each with its own step.
  const odd = terms.filter((_, i) => i % 2 === 0);
  const even = terms.filter((_, i) => i % 2 === 1);
  const run = (xs: number[]) =>
    xs.slice(1).every((x, i) => x - xs[i] === xs[1] - xs[0]);
  if (run(odd) && run(even)) {
    const xs = n % 2 === 0 ? odd : even;
    next.add(xs[xs.length - 1] + (xs[1] - xs[0]));
  }
  return [...next];
}

function alternatingSequence(random: () => number): NumberBomb {
  for (;;) {
    const up = 3 + Math.floor(random() * 6);
    const down = 1 + Math.floor(random() * 4);
    if (up === down) continue;
    const start = 2 + Math.floor(random() * 9);
    const terms = [start];
    for (let i = 1; i < 6; i += 1)
      terms.push(terms[i - 1] + (i % 2 ? up : -down));
    const shown = terms.slice(0, 5);
    const answer = terms[5];
    const agreed = sequenceAnswers(shown);
    if (agreed.length !== 1 || agreed[0] !== answer) continue;
    let body = '';
    [...shown, null].forEach((value, index) => {
      const cx = W / 2 + (2.5 - index) * 160;
      body +=
        card(cx - 68, 260, 136, 136, value === null ? '#FFF4D6' : '#FFFFFF') +
        text(
          value === null ? '؟' : ltr(String(value)),
          cx,
          352,
          62,
          value === null ? RED : INK,
        );
    });
    return {
      variantKey: 'alternating-sequence',
      variant: `+${up}-${down}:${start}`,
      prompt: 'وش الرقم اللي بعده؟',
      answer,
      altText: 'خمسة أرقام في صف وبعدها خانة فاضية',
      concept: 'Spot two steps taken in turn and take the next one.',
      factualClaim: `${shown.join(', ')}: +${up} then −${down} in turn, so the next is ${answer}.`,
      svg: frame(body),
    };
  }
}

export function composeNumberBomb(
  seed: string,
  variantKey: string,
): NumberBomb {
  const random = seededRandom(`bomb-number-puzzles:${variantKey}:${seed}`);
  switch (variantKey) {
    case 'secret-code':
      return secretCode(random, false);
    case 'secret-code-product':
      return secretCode(random, true);
    case 'hidden-symbol':
      return hiddenSymbol(random);
    case 'domino-gap':
      return dominoGap(random);
    case 'fewest-coins':
      return fewestCoinsPuzzle(random);
    case 'number-grid':
      return numberGrid(random);
    case 'mystery-machine':
      return mysteryMachine(random);
    default:
      return alternatingSequence(random);
  }
}
