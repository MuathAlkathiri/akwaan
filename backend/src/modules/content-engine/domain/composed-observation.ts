import {
  ComposedPuzzleDrawing,
  H,
  INK,
  LETTERS,
  PAPER,
  W,
  asOptions,
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
  thingSilhouetteSvg,
  thingSvg,
} from './drawn-things';

/**
 * قوة الملاحظة — more of what is noticed rather than worked out: a break in
 * a mirror-image board, a true reflection, what lies on top of a pile, and
 * sizes the eye misjudges.
 */
export const OBSERVATION_VARIANTS = {
  'visual-asymmetry-detection': ['intruder', 'missing'],
  'reflection-fidelity': ['mirror-clock', 'true-mirror'],
  'overlapping-boundary-trace': ['on-top', 'at-bottom'],
  'size-distortion-illusion': [
    'arrow-lines',
    'surrounded-circles',
    'tall-or-wide',
  ],
} as const;

export type ObservationFamily = keyof typeof OBSERVATION_VARIANTS;

const cast = (count: number, random: () => number): DrawnThing[] =>
  shuffled(
    drawnThings().filter((thing) => thing.category !== 'place'),
    random,
  ).slice(0, count);

/** A drawing as a mirror shows it: flipped left to right about its centre. */
const flippedThing = (
  thing: DrawnThing,
  cx: number,
  cy: number,
  size: number,
) =>
  `<g transform="translate(${round(2 * cx)} 0) scale(-1 1)">${thingSvg(thing, cx, cy, size)}</g>`;

// ---------------------------------------------------------------------------
// كسر التناظر
// ---------------------------------------------------------------------------

/**
 * A board whose right half mirrors its left: three rows of two things, the
 * same two reflected on the other side of the line.
 */
export function mirrorBoardSvg(
  left: ReadonlyArray<DrawnThing>,
  right: ReadonlyArray<DrawnThing | null>,
): string {
  const cell = 170;
  const x0 = W / 2 - 2 * cell;
  const y0 = (H - 3 * cell) / 2;
  let body =
    `<rect x="${x0 - 20}" y="${y0 - 20}" width="${4 * cell + 40}" height="${3 * cell + 40}" rx="32" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
    `<line x1="${W / 2}" y1="${y0 - 20}" x2="${W / 2}" y2="${y0 + 3 * cell + 20}" stroke="${INK}" stroke-width="7" stroke-dasharray="18 16"/>`;
  for (let index = 0; index < 6; index += 1) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const y = y0 + row * cell + cell / 2;
    // Column 0 is the outer one on both sides: the halves mirror each other.
    const leftX = x0 + column * cell + cell / 2;
    const rightX = x0 + (3 - column) * cell + cell / 2;
    body += `<g data-side="left" data-slot="${index}" data-thing="${left[index].key}">${thingSvg(left[index], leftX, y, 120)}</g>`;
    const mirrored = right[index];
    if (mirrored) {
      body += `<g data-side="right" data-slot="${index}" data-thing="${mirrored.key}">${flippedThing(mirrored, rightX, y, 120)}</g>`;
    }
  }
  return frame(body);
}

function composeAsymmetry(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(
    `visual-asymmetry-detection:${variantKey}:${seed}`,
  );
  const things = cast(7, random);
  const left = things.slice(0, 6);
  const slot = Math.floor(random() * 6);
  const outsider = things[6];
  const missing = variantKey === 'missing';
  const right = left.map((thing, index) =>
    index === slot ? (missing ? null : outsider) : thing,
  );
  const answer = missing ? left[slot] : outsider;
  const others = shuffled(
    left.filter((_, index) => index !== slot),
    random,
  );
  const tempting = missing ? others.slice(0, 2) : [left[slot], others[0]];
  const { options, correctOptionId } = asOptions(
    [answer, ...tempting].map((thing) => thing.ar),
    answer.ar,
    random,
  );
  return {
    familyKey: 'visual-asymmetry-detection',
    variantKey,
    variant: `${variantKey}:${slot}:${answer.key}`,
    prompt: missing
      ? 'اليمين مراية لليسار، بس فيه شي واحد ناقص من اليمين. وش هو؟'
      : 'اليمين مراية لليسار إلا في مكان واحد. وش الشي اللي على اليمين وما له مقابل؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      missing
        ? 'It is on both sides of the line, each the mirror of the other.'
        : 'It is on the left with its mirror image on the right — or it is the thing on the left whose place was taken, which is not on the right at all.',
    ),
    altText:
      'لوحة يقسمها خط، نصفها الأيمن صورة مراية لنصفها الأيسر إلا في مكان واحد',
    concept:
      'Scan a mirror-image board for the one place where the two halves disagree.',
    factualClaim: missing
      ? `Slot ${slot} holds "${answer.key}" on the left and nothing on the right.`
      : `Slot ${slot} holds "${left[slot].key}" on the left and "${answer.key}" on the right.`,
    svg: mirrorBoardSvg(left, right),
  };
}

// ---------------------------------------------------------------------------
// الانعكاس
// ---------------------------------------------------------------------------

/** A clock seen in a mirror reads as twelve hours less the true time. */
export const mirroredMinutes = (minutes: number): number =>
  (720 - (minutes % 720)) % 720;

const clockText = (minutes: number): string => {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, '0')}`;
};

export function clockSvg(minutes: number): string {
  const cx = W / 2;
  const cy = H / 2;
  const radius = 250;
  let body = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#FFFFFF" stroke="${INK}" stroke-width="14"/>`;
  for (let tick = 0; tick < 12; tick += 1) {
    const angle = (tick * Math.PI) / 6;
    const inner = tick % 3 === 0 ? radius - 46 : radius - 28;
    body += `<line x1="${round(cx + inner * Math.sin(angle))}" y1="${round(cy - inner * Math.cos(angle))}" x2="${round(cx + (radius - 12) * Math.sin(angle))}" y2="${round(cy - (radius - 12) * Math.cos(angle))}" stroke="${INK}" stroke-width="${tick % 3 === 0 ? 12 : 7}" stroke-linecap="round"/>`;
  }
  const hand = (turn: number, length: number, width: number, colour: string) =>
    `<line x1="${cx}" y1="${cy}" x2="${round(cx + length * Math.sin(turn * 2 * Math.PI))}" y2="${round(cy - length * Math.cos(turn * 2 * Math.PI))}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
  body +=
    `<g data-shown="${minutes}">` +
    hand(minutes / 720, 140, 18, INK) +
    hand((minutes % 60) / 60, 205, 11, '#D8493F') +
    `</g><circle cx="${cx}" cy="${cy}" r="16" fill="${INK}"/>`;
  return frame(body);
}

/** Things that plainly face one way, so a flip of them shows. */
const FACING = [
  'duck',
  'dog',
  'cat',
  'horse',
  'camel',
  'fish',
  'snail',
  'car',
  'bus',
  'truck',
  'bicycle',
  'airplane',
  'rocket',
  'shoe',
  'teapot',
  'key',
  'guitar',
  'hammer',
  'flamingo',
  'rooster',
  'giraffe',
  'elephant',
  'rabbit',
  'bird',
  'dolphin',
  'whale',
  'tractor',
  'ambulance',
  'train',
  'scooter',
  'motorcycle',
  'helicopter',
  'sailboat',
  'trumpet',
  'megaphone',
  'flashlight',
  'saxophone',
  'axe',
  'broom',
];

interface Shown {
  thing: DrawnThing;
  flipped: boolean;
}

export function mirrorRowsSvg(
  original: ReadonlyArray<DrawnThing>,
  rows: ReadonlyArray<ReadonlyArray<Shown>>,
): string {
  const xs = [400, 600, 800];
  const row = (y: number, shown: ReadonlyArray<Shown>, size: number) =>
    shown
      .map(({ thing, flipped }, index) =>
        flipped
          ? flippedThing(thing, xs[index], y, size)
          : thingSvg(thing, xs[index], y, size),
      )
      .join('');
  let body =
    `<rect x="290" y="24" width="620" height="150" rx="28" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
    `<g data-original="${original.map((thing) => thing.key).join(',')}">${row(
      99,
      original.map((thing) => ({ thing, flipped: false })),
      110,
    )}</g>`;
  rows.forEach((shown, index) => {
    const y = 262 + index * 148;
    body +=
      `<g data-row="${LETTERS[index]}" data-shown="${shown.map((entry) => `${entry.thing.key}${entry.flipped ? '!' : ''}`).join(',')}">` +
      `<rect x="290" y="${y - 62}" width="620" height="124" rx="28" fill="#F2E3BD" stroke="${INK}" stroke-width="8"/>` +
      row(y, shown, 96) +
      `${letterBadge(LETTERS[index], 980, y, 36)}</g>`;
  });
  return frame(body);
}

function composeReflection(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`reflection-fidelity:${variantKey}:${seed}`);
  if (variantKey === 'mirror-clock') {
    // A true time whose mirror image reads as another time.
    const real = pick(
      Array.from({ length: 72 }, (_, index) => index * 10).filter(
        (minutes) =>
          minutes >= 60 && Math.abs(mirroredMinutes(minutes) - minutes) >= 60,
      ),
      random,
    );
    const shown = mirroredMinutes(real);
    const near = shuffled([60, 660, 120], random)
      .map((shift) => (real + shift) % 720)
      .find((minutes) => minutes !== shown && minutes !== real)!;
    const { options, correctOptionId } = asOptions(
      [real, shown, near].map(clockText),
      clockText(real),
      random,
    );
    return {
      familyKey: 'reflection-fidelity',
      variantKey,
      variant: `${variantKey}:${real}:${shown}`,
      prompt: 'هذي ساعة تشوفها في المراية. كم الساعة الحقيقية؟',
      options,
      correctOptionId,
      distractorRationale: sameReason(options, correctOptionId, (id) =>
        options.find((option) => option.id === id)!.label === clockText(shown)
          ? 'Reads the clock as it looks, without undoing the mirror.'
          : 'Undoes the mirror for the minute hand and misplaces the hour by one.',
      ),
      altText: 'ساعة عقارب بدون أرقام، معكوسة مثل ما تبان في المراية',
      concept:
        'Undo a mirror: a reflected clock reads twelve hours less the true time.',
      factualClaim: `The clock is drawn at ${clockText(shown)}, the mirror image of ${clockText(real)}.`,
      svg: clockSvg(shown),
    };
  }
  const things = shuffled(
    drawnThings().filter((thing) => FACING.includes(thing.key)),
    random,
  ).slice(0, 3);
  const reversed = [...things].reverse();
  // A mirror beside the row reverses its order and flips each thing. The
  // wrong rows do only one of the two.
  const rows = shuffled(
    [
      {
        kind: 'mirror',
        shown: reversed.map((thing) => ({ thing, flipped: true })),
      },
      {
        kind: 'reversed-only',
        shown: reversed.map((thing) => ({ thing, flipped: false })),
      },
      {
        kind: 'flipped-only',
        shown: things.map((thing) => ({ thing, flipped: true })),
      },
    ],
    random,
  );
  const answer = rows.findIndex((row) => row.kind === 'mirror');
  const label = (index: number) => `الصف ${LETTERS[index]}`;
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map(label),
    label(answer),
    random,
  );
  return {
    familyKey: 'reflection-fidelity',
    variantKey,
    variant: `${variantKey}:${rows.map((row) => row.kind).join(',')}`,
    prompt: 'لو حطّينا مراية جنب الصف اللي فوق، أي صف يطلع فيها؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      'It does half of what a mirror does: it reverses the order without flipping the things, or flips them without reversing the order.',
    ),
    altText: 'صف من ثلاثة أشياء مرسومة، وتحته ثلاثة صفوف بحروف',
    concept:
      'A mirror beside a row reverses its order and flips each thing: find the row that does both.',
    factualClaim: `Rows ${rows.map((row, index) => `${LETTERS[index]}=${row.kind}`).join(', ')}.`,
    svg: mirrorRowsSvg(
      things,
      rows.map((row) => row.shown),
    ),
  };
}

// ---------------------------------------------------------------------------
// الكومة
// ---------------------------------------------------------------------------

/** Four stickers in one pile, drawn bottom first: each overlaps all the others. */
export function pileSvg(
  things: ReadonlyArray<DrawnThing>,
  turn: number,
): string {
  const size = 270;
  return frame(
    things
      .map((thing, index) => {
        const angle = turn + (index * Math.PI) / 2;
        const cx = W / 2 + 150 * Math.cos(angle);
        const cy = H / 2 + 105 * Math.sin(angle);
        // A white edge round each, so where one covers another can be seen.
        return (
          `<g data-layer="${index}" data-thing="${thing.key}">` +
          [
            [-9, 0],
            [9, 0],
            [0, -9],
            [0, 9],
            [-6, -6],
            [6, -6],
            [-6, 6],
            [6, 6],
          ]
            .map(([dx, dy]) =>
              thingSilhouetteSvg(thing, cx + dx, cy + dy, size, PAPER),
            )
            .join('') +
          `${thingSvg(thing, cx, cy, size)}</g>`
        );
      })
      .join(''),
  );
}

function composePile(seed: string, variantKey: string): ComposedPuzzleDrawing {
  const random = seededRandom(
    `overlapping-boundary-trace:${variantKey}:${seed}`,
  );
  // Solid, well-filled drawings: a thin one would not cover what is under it.
  const things = shuffled(
    drawnThings().filter(
      (thing) => thing.category !== 'place' && thing.twins.length >= 1,
    ),
    random,
  ).slice(0, 4);
  // Layers do not follow the circle round: the order has to be read off the
  // overlaps, not guessed from position.
  const layers = shuffled(things, random);
  const top = variantKey === 'on-top';
  const answer = top ? layers[3] : layers[0];
  const tempting = top ? [layers[2], layers[0]] : [layers[1], layers[3]];
  const { options, correctOptionId } = asOptions(
    [answer, ...tempting].map((thing) => thing.ar),
    answer.ar,
    random,
  );
  return {
    familyKey: 'overlapping-boundary-trace',
    variantKey,
    variant: `${variantKey}:${layers.map((thing) => thing.key).join('>')}`,
    prompt: top ? 'أي واحد فوق الكل في الكومة؟' : 'أي واحد تحت الكل في الكومة؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      top
        ? 'Part of it is covered by another thing in the pile.'
        : 'It covers part of another thing in the pile.',
    ),
    altText: 'أربعة أشياء مرسومة فوق بعض في كومة وحدة',
    concept:
      'Read a pile of overlapping drawings: which one nothing covers, or which one covers nothing.',
    factualClaim: `Drawn bottom to top: ${layers.map((thing) => thing.key).join(', ')}.`,
    svg: pileSvg(layers, random() * Math.PI * 2),
  };
}

// ---------------------------------------------------------------------------
// خداع الحجم
// ---------------------------------------------------------------------------

const RED_LINE = '#D8493F';
const BLUE_LINE = '#2F6FE0';

export function illusionSvg(
  variantKey: string,
  first: number,
  second: number,
): string {
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    colour: string,
    key: string,
  ) =>
    `<line data-measure="${key}" data-length="${round(Math.hypot(x2 - x1, y2 - y1))}" x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${colour}" stroke-width="14" stroke-linecap="round"/>`;
  const fin = (x: number, y: number, dx: number, dy: number) =>
    `<line x1="${round(x)}" y1="${round(y)}" x2="${round(x + dx)}" y2="${round(y + dy)}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  if (variantKey === 'surrounded-circles') {
    const ring = (
      cx: number,
      radius: number,
      around: number,
      count: number,
      key: string,
    ) => {
      let body = '';
      const orbit = radius + around + 22;
      for (let index = 0; index < count; index += 1) {
        const angle = (index * 2 * Math.PI) / count;
        body += `<circle cx="${round(cx + orbit * Math.cos(angle))}" cy="${round(H / 2 + orbit * Math.sin(angle))}" r="${around}" fill="#B9BCC9" stroke="${INK}" stroke-width="6"/>`;
      }
      return (
        body +
        `<circle data-measure="${key}" data-length="${radius}" cx="${cx}" cy="${H / 2}" r="${radius}" fill="#F08A24" stroke="${INK}" stroke-width="8"/>`
      );
    };
    // Big neighbours make the middle look small; small ones make it look big.
    return frame(
      ring(320, first, 96, 6, 'left') + ring(880, second, 26, 10, 'right'),
    );
  }
  if (variantKey === 'tall-or-wide') {
    const base = 520;
    return frame(
      line(
        W / 2 - second / 2,
        base,
        W / 2 + second / 2,
        base,
        BLUE_LINE,
        'blue',
      ) + line(W / 2, base, W / 2, base - first, RED_LINE, 'red'),
    );
  }
  // Fins pointing out make a line look short; fins pointing in make it long.
  const top = 230;
  const bottom = 450;
  const left = (length: number) => W / 2 - length / 2;
  return frame(
    line(left(first), top, left(first) + first, top, RED_LINE, 'red') +
      fin(left(first), top, 60, -52) +
      fin(left(first), top, 60, 52) +
      fin(left(first) + first, top, -60, -52) +
      fin(left(first) + first, top, -60, 52) +
      line(
        left(second),
        bottom,
        left(second) + second,
        bottom,
        BLUE_LINE,
        'blue',
      ) +
      fin(left(second), bottom, -60, -52) +
      fin(left(second), bottom, -60, 52) +
      fin(left(second) + second, bottom, 60, -52) +
      fin(left(second) + second, bottom, 60, 52),
  );
}

function composeIllusion(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`size-distortion-illusion:${variantKey}:${seed}`);
  const circles = variantKey === 'surrounded-circles';
  const base = circles ? 62 : variantKey === 'tall-or-wide' ? 360 : 480;
  // Either truly equal — the classic — or the one the eye calls smaller is in
  // fact a fifth larger. In each drawing the first is the one that looks
  // smaller: fins in, big neighbours, or lying flat.
  const equal = random() < 0.55;
  const looksSmaller =
    circles || variantKey === 'arrow-lines' ? 'first' : 'second';
  const grown = Math.round(base * 1.2);
  const first = !equal && looksSmaller === 'first' ? grown : base;
  const second = !equal && looksSmaller === 'second' ? grown : base;
  const names = circles
    ? { first: 'اليسار', second: 'اليمين', equal: 'متساويتين' }
    : { first: 'الأحمر', second: 'الأزرق', equal: 'متساويين' };
  const answer = equal ? names.equal : names[looksSmaller];
  const { options, correctOptionId } = asOptions(
    [names.first, names.second, names.equal],
    answer,
    random,
  );
  return {
    familyKey: 'size-distortion-illusion',
    variantKey,
    variant: `${variantKey}:${first}:${second}`,
    prompt: circles
      ? 'أي دائرة برتقالية أكبر؟'
      : 'أي خط أطول؟ (الخط الملوّن نفسه)',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      equal
        ? 'What surrounds it makes it look larger or smaller; measured, the two are the same.'
        : 'Trusts the look, or assumes the usual trick of two equal sizes; measured, the other is a fifth larger.',
    ),
    altText: circles
      ? 'دائرتان برتقاليتان، وحدة حولها دوائر كبيرة والثانية حولها دوائر صغيرة'
      : 'خطان ملوّنان، أحمر وأزرق',
    concept:
      'A size the eye misjudges because of what surrounds it: decide by the sizes themselves.',
    factualClaim: `Measured sizes: ${names.first} ${first}, ${names.second} ${second}.`,
    svg: illusionSvg(variantKey, first, second),
  };
}

export function composeObservation(
  familyKey: ObservationFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  if (familyKey === 'visual-asymmetry-detection') {
    return composeAsymmetry(seed, variantKey);
  }
  if (familyKey === 'reflection-fidelity') {
    return composeReflection(seed, variantKey);
  }
  if (familyKey === 'overlapping-boundary-trace') {
    return composePile(seed, variantKey);
  }
  return composeIllusion(seed, variantKey);
}
