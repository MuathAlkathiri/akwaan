import {
  DRAWN_THING_CATEGORIES,
  DrawnThing,
  drawnThings,
  drawnThingsOf,
  thingSilhouetteSvg,
  thingSvg,
  toThe,
} from './drawn-things';

/**
 * Drawn puzzles answered by choosing — the second kind of composed item.
 *
 * Like every composed family, each is produced whole from one seed: the
 * drawing, the question, the options and which of them is right. The
 * answer is not looked up or reasoned out afterwards; it is the same fact the
 * drawing was made from (which thread was routed to which end, which faces a
 * fold brings opposite, how many layers a punch went through).
 *
 * Strings in, a description out, like `composed-visuals.ts`. The one thing
 * read from outside is the library of drawn things (`drawn-things.ts`), which
 * dresses the same puzzles in everyday objects; without it they are drawn
 * plain.
 */
export const COMPOSED_PUZZLE_FAMILIES = [
  'wire-trace-terminal',
  'opposite-cube-faces',
  'fold-and-punch',
  'visual-closure-fragment',
  'spot-the-difference',
  'visual-match-scan',
  'count-changes',
  'mirror-beam',
  'last-pipe-piece',
  'lying-guard',
  'false-scale',
  'broken-rule-step',
  'broken-grid-pattern',
  'gear-train-direction',
  'maze-exit-route',
  'shortest-path-grid',
  'domino-cascade-chain',
  'one-way-traffic-flow',
  'electrical-switch-circuit',
  'mental-rotation-2d',
  'mirror-vs-rotation-discrim',
  'missing-puzzle-piece',
  'cube-net-fold',
  'spatial-cube-count',
  'orthographic-projection',
  'visual-asymmetry-detection',
  'reflection-fidelity',
  'overlapping-boundary-trace',
  'size-distortion-illusion',
  'picture-initials',
  'wordle-single-guess',
] as const;

export type ComposedPuzzleFamily = (typeof COMPOSED_PUZZLE_FAMILIES)[number];

import {
  ComposedPuzzleDrawing,
  GOLD,
  H,
  INK,
  PAPER,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  asOptions,
  frame,
  pick,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';

import {
  ASSEMBLY_VARIANTS,
  AssemblyFamily,
  composeAssembly,
} from './composed-assembly';
import { RYO_VARIANTS, RyoFamily, composeRyo } from './composed-ryo';
import {
  ERRORS_VARIANTS,
  ErrorsFamily,
  composeErrors,
} from './composed-errors';
import {
  WORDLE_VARIANTS,
  WordleFamily,
  composeWordle,
} from './composed-wordle';
import {
  LETTERS_VARIANTS,
  LettersFamily,
  composeLetters,
} from './composed-letters';
import {
  OBSERVATION_VARIANTS,
  ObservationFamily,
  composeObservation,
} from './composed-observation';
import { PATHS_VARIANTS, PathsFamily, composePaths } from './composed-paths';
import { CUBE_NETS, Cell, cubeNetNormals, cubeNetOpposites } from './cube-nets';

export { CUBE_NETS, cubeNetNormals, cubeNetOpposites };

export { PUZZLE_FONT_FAMILY, seededRandom };

/**
 * The kinds of question each family can ask of its drawing. These are the
 * family's templates: the catalog lists the same keys, the allocator rotates
 * them, and a batch never repeats the previous batch's while another is left.
 */
export const COMPOSED_PUZZLE_VARIANTS = {
  'wire-trace-terminal': [
    'which-start',
    'which-end',
    'count-crossings',
    'broken-thread',
  ],
  'opposite-cube-faces': ['opposite', 'opposite-pair', 'not-touching'],
  'fold-and-punch': ['count-holes', 'count-folds'],
  'visual-closure-fragment': [
    'shadow',
    'close-up',
    'half-hidden',
    'upside-down',
    'shattered',
  ],
  'spot-the-difference': ['vanished', 'appeared', 'replaced'],
  'visual-match-scan': ['duplicate', 'absent', 'no-twin'],
  'count-changes': ['mixed', 'same-kind'],
  ...RYO_VARIANTS,
  ...ERRORS_VARIANTS,
  ...PATHS_VARIANTS,
  ...ASSEMBLY_VARIANTS,
  ...OBSERVATION_VARIANTS,
  ...LETTERS_VARIANTS,
  ...WORDLE_VARIANTS,
} as const satisfies Record<ComposedPuzzleFamily, readonly string[]>;

export interface ComposedPuzzle extends ComposedPuzzleDrawing {
  familyKey: ComposedPuzzleFamily;
}

/** The template asked for, or one chosen by the seed when none was. */
function chooseVariant(
  familyKey: ComposedPuzzleFamily,
  seed: string,
  variantKey?: string,
): string {
  const variants: readonly string[] = COMPOSED_PUZZLE_VARIANTS[familyKey];
  return variantKey && variants.includes(variantKey)
    ? variantKey
    : pick(variants, seededRandom(`${familyKey}:variant:${seed}`));
}

/** A drawn shape centred on a point; `scale` 1 is about 110px across. */
function shapeAt(key: string, cx: number, cy: number, scale = 1): string {
  const style = `fill="${GOLD}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"`;
  let shape: string;
  if (key === 'square') {
    shape = `<rect x="-46" y="-46" width="92" height="92" rx="10" ${style}/>`;
  } else if (key === 'triangle') {
    shape = `<polygon points="0,-54 54,42 -54,42" ${style}/>`;
  } else if (key === 'circle') {
    shape = `<circle cx="0" cy="0" r="50" ${style}/>`;
  } else if (key === 'heart') {
    shape = `<path d="M0 50 C -78 -2, -50 -66, 0 -26 C 50 -66, 78 -2, 0 50 Z" ${style}/>`;
  } else if (key === 'plus') {
    shape = `<polygon points="-18,-52 18,-52 18,-18 52,-18 52,18 18,18 18,52 -18,52 -18,18 -52,18 -52,-18 -18,-18" ${style}/>`;
  } else {
    let points = '';
    for (let k = 0; k < 10; k += 1) {
      const radius = k % 2 ? 25 : 56;
      const angle = -Math.PI / 2 + (k * Math.PI) / 5;
      points += `${round(radius * Math.cos(angle))},${round(radius * Math.sin(angle))} `;
    }
    shape = `<polygon points="${points.trim()}" ${style}/>`;
  }
  return `<g transform="translate(${round(cx)} ${round(cy)}) scale(${scale})">${shape}</g>`;
}

// ---------------------------------------------------------------------------
// تتبّع الخيط
// ---------------------------------------------------------------------------

export const THREAD_STARTS = [
  { key: 'red', name: 'الحمراء', colour: '#D8493F' },
  { key: 'blue', name: 'الزرقاء', colour: '#2F6FE0' },
  { key: 'green', name: 'الخضراء', colour: '#2FA866' },
  { key: 'purple', name: 'البنفسجية', colour: '#8A4FD0' },
] as const;

export const THREAD_ENDS = [
  { key: 'star', name: 'النجمة', to: 'للنجمة' },
  { key: 'square', name: 'المربع', to: 'للمربع' },
  { key: 'triangle', name: 'المثلث', to: 'للمثلث' },
  { key: 'heart', name: 'القلب', to: 'للقلب' },
] as const;

type ThreadStart = (typeof THREAD_STARTS)[number];
type ThreadEnd = (typeof THREAD_ENDS)[number];

/**
 * How the threads are laid on the page: three or four of them, running from
 * the left or — mirrored — from the right. `lanes` are the positions across
 * the threads and `columns` the five stations along them.
 */
export const THREAD_LAYOUTS = [
  {
    key: 'three-from-left',
    threads: 3,
    lanes: [150, 338, 525],
    columns: [150, 410, 640, 870, 1050],
    scale: 1,
  },
  {
    key: 'three-from-right',
    threads: 3,
    lanes: [150, 338, 525],
    columns: [1050, 790, 560, 330, 150],
    scale: 1,
  },
  {
    key: 'four-from-left',
    threads: 4,
    lanes: [92, 256, 419, 583],
    columns: [150, 410, 640, 870, 1050],
    scale: 0.8,
  },
  {
    key: 'four-from-right',
    threads: 4,
    lanes: [92, 256, 419, 583],
    columns: [1050, 790, 560, 330, 150],
    scale: 0.8,
  },
] as const;

export type ThreadLayout = (typeof THREAD_LAYOUTS)[number];

export interface ThreadRouting {
  /** `lanes[thread][column]` — the lane a thread is in at each column. */
  lanes: number[][];
  /** `endOf[thread]` — the index of the end it reaches. */
  endOf: number[];
}

function permutations(count: number): number[][] {
  const result: number[][] = [];
  const walk = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    rest.forEach((value, index) =>
      walk(
        [...prefix, value],
        [...rest.slice(0, index), ...rest.slice(index + 1)],
      ),
    );
  };
  walk(
    [],
    Array.from({ length: count }, (_, index) => index),
  );
  return result;
}

/**
 * Whether the move from one arrangement to the next keeps its crossings
 * apart. Between two stations a thread's lane changes along one shared curve,
 * so two threads meet where their lanes are equal; three threads through one
 * point (or two crossings almost on top of each other) cannot be traced.
 */
function crossesCleanly(from: number[], to: number[]): boolean {
  const meetings: Array<{ along: number; lane: number }> = [];
  for (let a = 0; a < from.length; a += 1) {
    for (let b = a + 1; b < from.length; b += 1) {
      const before = from[a] - from[b];
      const after = to[a] - to[b];
      if (before * after >= 0) continue;
      const along = before / (before - after);
      meetings.push({ along, lane: from[a] + (to[a] - from[a]) * along });
    }
  }
  return meetings.every((one, index) =>
    meetings
      .slice(index + 1)
      .every(
        (other) =>
          Math.abs(one.along - other.along) > 0.12 ||
          Math.abs(one.lane - other.lane) > 0.3,
      ),
  );
}

/**
 * Route the threads so that none ends where it started, every thread changes
 * lane at every station, and no two crossings land on top of each other: a
 * thread that runs straight across is not traced, it is read off.
 */
export function routeThreads(random: () => number, count = 3): ThreadRouting {
  const orders = permutations(count);
  /** Arrangements in which every thread sits in a different lane than in `from`. */
  const allMoved = (from: number[]) =>
    orders.filter((order) =>
      order.every((lane, thread) => lane !== from[thread]),
    );
  /** Prefer the moves whose crossings stay apart, while there are any. */
  const next = (from: number[], candidates: number[][]) => {
    const clean = candidates.filter((order) => crossesCleanly(from, order));
    return pick(clean.length ? clean : candidates, random);
  };
  const identity = orders[0];
  const first = next(identity, allMoved(identity));
  const second = next(first, allMoved(first));
  // No thread ends level with where it started, and none coasts into its end.
  const settled = allMoved(identity).filter((order) =>
    order.every((lane, thread) => lane !== second[thread]),
  );
  const endOf = next(
    second,
    settled.length
      ? settled
      : allMoved(identity).filter((order) => order.join() !== second.join()),
  );
  return {
    lanes: identity.map((thread) => [
      thread,
      first[thread],
      second[thread],
      endOf[thread],
      endOf[thread],
    ]),
    endOf,
  };
}

/**
 * How many times one thread crosses the others. Between two stations every
 * thread follows the same curve scaled to its own lanes, so two threads cross
 * there exactly once when their order flips and never otherwise.
 */
export function threadCrossings(
  routing: ThreadRouting,
  thread: number,
): number {
  let crossings = 0;
  routing.lanes.forEach((other, index) => {
    if (index === thread) return;
    for (let column = 0; column + 1 < other.length; column += 1) {
      const before = routing.lanes[thread][column] - other[column];
      const after = routing.lanes[thread][column + 1] - other[column + 1];
      if (before * after < 0) crossings += 1;
    }
  });
  return crossings;
}

/** What sits at one end of a thread: a plain mark, or a drawn thing. */
export interface ThreadStation {
  key: string;
  /** How an option names it: «الحمراء», «القطة». */
  name: string;
  /** How a question names it: «الدائرة الحمراء», «القطة». */
  inQuestion: string;
  /** «للنجمة», «للجزرة». */
  to: string;
  colour?: string;
  thing?: DrawnThing;
}

const plainStart = (start: ThreadStart): ThreadStation => ({
  key: start.key,
  name: start.name,
  inQuestion: `الدائرة ${start.name}`,
  to: `للدائرة ${start.name}`,
  colour: start.colour,
});

const plainEnd = (end: ThreadEnd): ThreadStation => ({
  key: end.key,
  name: end.name,
  inQuestion: end.name,
  to: end.to,
});

const thingStation = (thing: DrawnThing): ThreadStation => ({
  key: thing.key,
  name: thing.the,
  inQuestion: thing.the,
  to: toThe(thing.the),
  thing,
});

/** A drawn thing on a white plate, so a thread visibly arrives at it. */
function thingOnPlate(
  thing: DrawnThing,
  cx: number,
  cy: number,
  scale: number,
): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${round(70 * scale)}" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
    thingSvg(thing, cx, cy, round(104 * scale))
  );
}

export function threadsSvg(
  routing: ThreadRouting,
  ends: ReadonlyArray<ThreadStation>,
  drawing: {
    layout?: ThreadLayout;
    starts?: ReadonlyArray<ThreadStation>;
    /** A thread cut at one of its middle stations. */
    cut?: { thread: number; column: number };
  } = {},
): string {
  const layout = drawing.layout ?? THREAD_LAYOUTS[0];
  const starts = drawing.starts ?? THREAD_STARTS.map(plainStart);
  // Mirrored, the run goes right to left and the ends sit on the left.
  const direction = layout.columns[4] > layout.columns[0] ? 1 : -1;
  const at = (lane: number, column: number, along = 0) => ({
    x: layout.columns[column] + along * direction,
    y: layout.lanes[lane],
  });
  let body = '';
  routing.lanes.forEach((lanes, thread) => {
    const points = lanes.map((lane, column) => at(lane, column));
    // Level tangents at every station: smooth S-curves that cross cleanly
    // instead of kinking.
    let path = `M${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const middle = (from.x + to.x) / 2;
      path += ` C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`;
    }
    // Every thread is the same ink: colour must not do the tracing.
    body += `<path data-thread="${thread}" d="${path}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  if (drawing.cut) {
    // At a station no other thread is near, so the gap removes only this one.
    const { x, y } = at(
      routing.lanes[drawing.cut.thread][drawing.cut.column],
      drawing.cut.column,
    );
    body += `<circle data-cut="${drawing.cut.thread}" cx="${x}" cy="${y}" r="${round(36 * layout.scale)}" fill="${PAPER}"/>`;
  }
  routing.lanes.forEach((_, thread) => {
    const start = starts[thread];
    const from = at(thread, 0);
    body += `<g data-start="${start.key}" data-name="${start.name}">${
      start.thing
        ? thingOnPlate(start.thing, from.x, from.y, layout.scale)
        : `<circle cx="${from.x}" cy="${from.y}" r="${round(46 * layout.scale)}" fill="${start.colour}" stroke="${INK}" stroke-width="10"/>`
    }</g>`;
    const end = ends[thread];
    const to = at(thread, 4, 20);
    body += `<g data-end="${end.key}" data-name="${end.name}" data-to="${end.to}">${
      end.thing
        ? thingOnPlate(end.thing, to.x, to.y, layout.scale)
        : shapeAt(end.key, to.x, to.y, layout.scale)
    }</g>`;
  });
  return frame(body);
}

/** Categories with enough drawings to fill one side of a thread puzzle. */
const threadCategories = () =>
  DRAWN_THING_CATEGORIES.filter(
    (category) => drawnThingsOf(category).length >= 8,
  );

/**
 * Who is at the two ends: coloured circles to shapes, or — two times in
 * three, when the library is there — things of one kind to things of another.
 */
function threadCast(
  count: number,
  random: () => number,
): {
  skin: string;
  starts: ThreadStation[];
  ends: ThreadStation[];
  /** «دائرة» is feminine and a thing is «واحد». */
  whichStart: (to: string) => string;
  whoseCut: string;
} {
  const categories = threadCategories();
  if (categories.length >= 2 && random() < 2 / 3) {
    const [from, to] = shuffled(categories, random);
    return {
      skin: `${from}-to-${to}`,
      starts: shuffled(drawnThingsOf(from), random)
        .slice(0, count)
        .map(thingStation),
      ends: shuffled(drawnThingsOf(to), random)
        .slice(0, count)
        .map(thingStation),
      whichStart: (end) => `أي واحد خيطه يوصل ${end}؟`,
      whoseCut: 'فيه خيط واحد مقطوع. خيط أي واحد؟',
    };
  }
  return {
    skin: 'plain',
    starts: shuffled(THREAD_STARTS, random).slice(0, count).map(plainStart),
    ends: shuffled(THREAD_ENDS, random).slice(0, count).map(plainEnd),
    whichStart: (end) => `أي دائرة خيطها يوصل ${end}؟`,
    whoseCut: 'فيه خيط واحد مقطوع. خيط أي دائرة؟',
  };
}

const COUNT_WORDS = [
  'ولا مرة',
  'مرة وحدة',
  'مرتين',
  '3 مرات',
  '4 مرات',
  '5 مرات',
  '6 مرات',
  '7 مرات',
  '8 مرات',
  '9 مرات',
  '10 مرات',
  '11 مرة',
];

function composeThreads(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`wire-trace-terminal:${variantKey}:${seed}`);
  // Counting crossings is asked of three threads only: with four there are
  // too many to count against the clock.
  const layout = pick(
    variantKey === 'count-crossings'
      ? THREAD_LAYOUTS.filter((entry) => entry.threads === 3)
      : THREAD_LAYOUTS,
    random,
  );
  const routing = routeThreads(random, layout.threads);
  const cast = threadCast(layout.threads, random);
  const { starts, ends } = cast;
  const threads = starts.map((_, index) => index);
  /** The right label against two of the others, in a seeded order. */
  const among = (labels: string[], correct: string) =>
    asOptions(
      [
        correct,
        ...shuffled(
          labels.filter((label) => label !== correct),
          random,
        ).slice(0, 3),
      ],
      correct,
      random,
    );
  const shared = {
    familyKey: 'wire-trace-terminal' as const,
    variantKey,
    altText:
      cast.skin === 'plain'
        ? `${layout.threads === 4 ? 'أربع' : 'ثلاث'} دوائر ملوّنة تخرج منها خيوط متشابكة إلى أشكال`
        : `${layout.threads === 4 ? 'أربعة' : 'ثلاثة'} أشياء مرسومة تخرج منها خيوط متشابكة إلى أشياء ثانية`,
  };
  const reaches = (thread: number) => ends[routing.endOf[thread]];

  if (variantKey === 'which-end') {
    const asked = pick(threads, random);
    const { options, correctOptionId } = among(
      ends.map((end) => end.name),
      reaches(asked).name,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${cast.skin}:${starts[asked].key}`,
      prompt: `خيط ${starts[asked].inQuestion} يوصل لوين؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Another thread ends there; a tracer who switches threads at a crossing lands on it.',
        })),
      concept:
        'Follow one named thread through the crossings and say which shape it reaches.',
      factualClaim: `The ${starts[asked].key} thread was routed to the ${reaches(asked).key}.`,
      svg: threadsSvg(routing, ends, { layout, starts }),
    };
  }

  if (variantKey === 'count-crossings') {
    const asked = pick(threads, random);
    const answer = threadCrossings(routing, asked);
    const wrong = [answer - 1, answer + 1, answer + 2, answer - 2]
      .filter((value) => value >= 1)
      .slice(0, 3);
    const { options, correctOptionId } = asOptions(
      [answer, ...wrong].map((value) => COUNT_WORDS[value]),
      COUNT_WORDS[answer],
      random,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${cast.skin}:${starts[asked].key}:${answer}`,
      prompt: `خيط ${starts[asked].inQuestion} كم مرة يتقاطع مع الخيوط الثانية؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why:
            COUNT_WORDS.indexOf(option.label) < answer
              ? 'Misses a crossing where two other threads meet close by.'
              : 'Counts a crossing between two other threads as one of its own.',
        })),
      concept:
        'Follow one named thread and count how many times it crosses the others.',
      factualClaim: `The ${starts[asked].key} thread crosses the other threads ${answer} time(s).`,
      svg: threadsSvg(routing, ends, { layout, starts }),
    };
  }

  if (variantKey === 'broken-thread') {
    const cut = { thread: pick(threads, random), column: pick([1, 2], random) };
    const { options, correctOptionId } = among(
      starts.map((start) => start.name),
      starts[cut.thread].name,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${cast.skin}:${starts[cut.thread].key}`,
      prompt: cast.whoseCut,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Its thread passes near the gap and runs unbroken to its shape.',
        })),
      altText: `${shared.altText}، وواحد منها مقطوع`,
      concept:
        'Find which start owns the one thread that is cut before it arrives.',
      factualClaim: `The ${starts[cut.thread].key} thread was cut at station ${cut.column}.`,
      svg: threadsSvg(routing, ends, { layout, starts, cut }),
    };
  }

  const askedEnd = pick(threads, random);
  const answerThread = routing.endOf.indexOf(askedEnd);
  const { options, correctOptionId } = among(
    starts.map((start) => start.name),
    starts[answerThread].name,
  );
  return {
    ...shared,
    variant: `${variantKey}:${layout.key}:${cast.skin}:${ends[askedEnd].key}`,
    prompt: cast.whichStart(ends[askedEnd].to),
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => {
        const thread = starts.findIndex((start) => start.name === option.label);
        return {
          optionId: option.id,
          why: `Its thread ends at ${reaches(thread).key}; a tracer who loses the line at a crossing lands here.`,
        };
      }),
    concept:
      'Follow crossing threads back from a named shape to the coloured start that owns it.',
    factualClaim: `The ${starts[answerThread].key} thread was routed to the ${ends[askedEnd].key}.`,
    svg: threadsSvg(routing, ends, { layout, starts }),
  };
}
// ---------------------------------------------------------------------------
// المكعب المطوي
// ---------------------------------------------------------------------------

/**
 * What is written or drawn on the six faces: everyday names (never a brand),
 * plain colours, or simple shapes.
 */
export const CUBE_THEMES: ReadonlyArray<{
  key: string;
  labels: string[];
  fills?: string[];
  shapes?: string[];
}> = [
  { key: 'dishes', labels: ['كبسة', 'مندي', 'جريش', 'سليق', 'مطبق', 'معصوب'] },
  {
    key: 'cities',
    labels: ['الرياض', 'جدة', 'أبها', 'تبوك', 'حائل', 'الدمام'],
  },
  { key: 'fruits', labels: ['تفاح', 'موز', 'عنب', 'تمر', 'رمان', 'مانجو'] },
  { key: 'animals', labels: ['جمل', 'صقر', 'حصان', 'غزال', 'ذيب', 'نمر'] },
  { key: 'sports', labels: ['قدم', 'سلة', 'طائرة', 'تنس', 'سباحة', 'جري'] },
  {
    key: 'colours',
    labels: ['الأحمر', 'الأزرق', 'الأخضر', 'الأصفر', 'البرتقالي', 'البنفسجي'],
    fills: ['#D8493F', '#2F6FE0', '#2FA866', '#F2C230', '#F08A24', '#8A4FD0'],
  },
  {
    key: 'shapes',
    labels: ['النجمة', 'المربع', 'المثلث', 'الدائرة', 'القلب', 'علامة الزائد'],
    shapes: ['star', 'square', 'triangle', 'circle', 'heart', 'plus'],
  },
];

export interface CubeFace {
  label: string;
  fill?: string;
  shape?: string;
  thing?: DrawnThing;
}

/**
 * Every set of faces a net can carry: the written, coloured and shaped ones
 * above, and one of drawn things per kind the library has enough of.
 */
export function cubeThemes(): Array<{ key: string; faces: CubeFace[] }> {
  return [
    ...CUBE_THEMES.map((theme) => ({
      key: theme.key,
      faces: theme.labels.map((label, index) => ({
        label,
        ...(theme.fills ? { fill: theme.fills[index] } : {}),
        ...(theme.shapes ? { shape: theme.shapes[index] } : {}),
      })),
    })),
    ...DRAWN_THING_CATEGORIES.map((category) => ({
      key: `drawn-${category}`,
      faces: drawnThingsOf(category).map((thing) => ({
        label: thing.ar,
        thing,
      })),
    })).filter((theme) => theme.faces.length >= 12),
  ];
}

export function cubeNetSvg(
  cells: readonly Cell[],
  faces: ReadonlyArray<CubeFace>,
): string {
  const columns = Math.max(...cells.map((cell) => cell[0])) + 1;
  const rows = Math.max(...cells.map((cell) => cell[1])) + 1;
  const size = Math.min(
    180,
    Math.floor(1040 / columns),
    Math.floor(560 / rows),
  );
  const originX = (W - columns * size) / 2;
  const originY = (H - rows * size) / 2;
  const fontSize = Math.round(size * 0.23);
  return frame(
    cells
      .map(([cx, cy], index) => {
        const x = originX + cx * size;
        const y = originY + cy * size;
        const face = faces[index];
        const inside = face.thing
          ? thingSvg(face.thing, x + size / 2, y + size / 2, round(size * 0.66))
          : face.shape
            ? shapeAt(face.shape, x + size / 2, y + size / 2, round(size / 200))
            : face.fill
              ? ''
              : `<text x="${x + size / 2}" y="${round(y + size / 2 + fontSize * 0.36)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${fontSize}" fill="${INK}">${face.label}</text>`;
        return (
          `<g data-face="${index}" data-label="${face.label}">` +
          `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${face.fill ?? '#FFFFFF'}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
          `${inside}</g>`
        );
      })
      .join(''),
  );
}

function composeCubeNet(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`opposite-cube-faces:${variantKey}:${seed}`);
  const net = pick(CUBE_NETS, random);
  const theme = pick(cubeThemes(), random);
  const faces: CubeFace[] = shuffled(theme.faces, random).slice(0, 6);
  const labels = faces.map((face) => face.label);
  const opposites = cubeNetOpposites(net.cells);
  /** How far apart two faces lie on the flat net, in steps. */
  const apart = (a: number, b: number) =>
    Math.abs(net.cells[a][0] - net.cells[b][0]) +
    Math.abs(net.cells[a][1] - net.cells[b][1]);
  const shared = {
    familyKey: 'opposite-cube-faces' as const,
    variantKey,
    variant: `${net.key}:${theme.key}:${variantKey}`,
    altText: faces[0].fill
      ? 'شبكة من ستة مربعات ملوّنة، تنطوي لتصير مكعبًا'
      : faces[0].shape || faces[0].thing
        ? 'شبكة من ستة مربعات على كل واحد رسمة، تنطوي لتصير مكعبًا'
        : 'شبكة من ستة مربعات عليها أسماء، تنطوي لتصير مكعبًا',
    svg: cubeNetSvg(net.cells, faces),
  };

  if (variantKey === 'opposite-pair') {
    const pairs: Array<[number, number]> = [];
    for (let a = 0; a < 6; a += 1) {
      for (let b = a + 1; b < 6; b += 1) pairs.push([a, b]);
    }
    const name = ([a, b]: [number, number]) => `${labels[a]} و${labels[b]}`;
    const answer = pick(
      pairs.filter(([a, b]) => opposites[a] === b),
      random,
    );
    // The tempting wrong pairs lie far apart on paper — they look as if they
    // must end up on opposite sides — yet folding brings them edge to edge.
    const far = shuffled(
      pairs.filter(([a, b]) => opposites[a] !== b),
      random,
    ).sort((p, q) => apart(q[0], q[1]) - apart(p[0], p[1]));
    // Three pairs built on one face would only ask what is opposite it.
    const second = far
      .slice(1)
      .find(
        (pair) =>
          !pair.some((face) => far[0].includes(face) && answer.includes(face)),
      );
    const first = second ?? far[1];
    // A third pair unlike the two already taken.
    const third = far.find((pair) => pair !== far[0] && pair !== first)!;
    const wrong = [far[0], first, third];
    const { options, correctOptionId } = asOptions(
      [answer, ...wrong].map(name),
      name(answer),
      random,
    );
    return {
      ...shared,
      prompt: 'لو انطوت هذي الشبكة وصارت مكعب، أي وجهين يصيرون متقابلين؟',
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Far apart on the flat net, so they look opposite — but folding brings these two to share an edge.',
        })),
      concept:
        'Fold a six-square net in the mind and pick the pair of faces that end up opposite.',
      factualClaim: `Folding net "${net.key}" puts face ${answer[0]} («${labels[answer[0]]}») opposite face ${answer[1]} («${labels[answer[1]]}»).`,
    };
  }

  const asked = Math.floor(random() * 6);
  const answer = opposites[asked];
  const others = net.cells
    .map((_, index) => index)
    .filter((index) => index !== asked && index !== answer);
  const notTouching = variantKey === 'not-touching';
  // Asked for the opposite face, the tempting wrong ones touch the asked
  // face on paper. Asked which face never touches it, they are the ones
  // farthest from it on paper — far, yet edge to edge once folded.
  const wrong = [...others]
    .sort(
      (a, b) =>
        (notTouching
          ? apart(b, asked) - apart(a, asked)
          : apart(a, asked) - apart(b, asked)) || a - b,
    )
    .slice(0, 3);
  const { options, correctOptionId } = asOptions(
    [labels[answer], ...wrong.map((index) => labels[index])],
    labels[answer],
    random,
  );
  return {
    ...shared,
    prompt: notTouching
      ? `لو انطوت هذي الشبكة وصارت مكعب، أي وجه ما يلمس «${labels[asked]}» أبدًا؟`
      : `لو انطوت هذي الشبكة وصارت مكعب، وش الوجه اللي يقابل «${labels[asked]}»؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why: notTouching
          ? 'It lies far from the asked face on the flat net, so it looks out of reach — but folding brings it to share an edge with it.'
          : 'It sits beside the asked face in the flat net, so it looks close — but a face beside another shares an edge with it and can never be opposite.',
      })),
    concept: notTouching
      ? 'Fold a six-square net in the mind and name the one face that never touches a given one.'
      : 'Fold a six-square net in the mind and name the face opposite a given one.',
    factualClaim: `Folding net "${net.key}" puts face ${asked} («${labels[asked]}») opposite face ${answer} («${labels[answer]}»).`,
  };
}

// ---------------------------------------------------------------------------
// الورقة المطوية
// ---------------------------------------------------------------------------

export const FOLD_CASES = [
  { folds: 1, punches: 1 },
  { folds: 1, punches: 2 },
  { folds: 1, punches: 3 },
  { folds: 2, punches: 1 },
  { folds: 2, punches: 2 },
  { folds: 2, punches: 3 },
  { folds: 3, punches: 1 },
] as const;

/** Every fold halves the paper, so every punch goes through 2^folds layers. */
export const holesAfterUnfolding = (folds: number, punches: number): number =>
  punches * 2 ** folds;

const FOLD_WORDS = ['', 'مرة وحدة', 'مرتين', 'ثلاث مرات'];
const PUNCH_WORDS = ['', 'خرم واحد', 'خرمين', 'ثلاثة خروم'];

/**
 * Fold `fold` (1-based) creases the sheet top to bottom — halving its width —
 * or side to side. The two alternate; `sidewaysFirst` starts with the other.
 */
const creaseIsUpright = (fold: number, sidewaysFirst: boolean): boolean =>
  (fold % 2 === 1) !== sidewaysFirst;

/** The sheet's size before any fold (index 0) and after each one. */
function foldedSizes(
  folds: number,
  sidewaysFirst: boolean,
  base: number,
): Array<{ w: number; h: number }> {
  const sizes = [{ w: base, h: base }];
  for (let fold = 1; fold <= folds; fold += 1) {
    const previous = sizes[fold - 1];
    sizes.push(
      creaseIsUpright(fold, sidewaysFirst)
        ? { w: previous.w / 2, h: previous.h }
        : { w: previous.w, h: previous.h / 2 },
    );
  }
  return sizes;
}

/** Where the punches go on the folded sheet, and how big: never on an edge. */
function punchSpots(
  size: { w: number; h: number },
  punches: number,
): { spots: Array<{ x: number; y: number }>; radius: number } {
  const along =
    punches === 1 ? [0.5] : punches === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
  const wide = size.w > size.h;
  return {
    spots: along.map((share) =>
      wide
        ? { x: size.w * share, y: size.h / 2 }
        : { x: size.w / 2, y: size.h * share },
    ),
    radius: Math.min(size.w, size.h) * (punches === 3 ? 0.1 : 0.13),
  };
}

/**
 * Open the sheet again: every fold undone mirrors each hole across that
 * fold's crease. Positions are on a sheet `base` wide.
 */
export function unfoldedHoles(
  folds: number,
  punches: number,
  sidewaysFirst = false,
  base = 1,
): { holes: Array<{ x: number; y: number }>; radius: number } {
  const sizes = foldedSizes(folds, sidewaysFirst, base);
  const { spots, radius } = punchSpots(sizes[folds], punches);
  let holes = spots;
  for (let fold = folds; fold >= 1; fold -= 1) {
    const folded = sizes[fold];
    holes = holes.flatMap((hole) =>
      creaseIsUpright(fold, sidewaysFirst)
        ? [hole, { x: 2 * folded.w - hole.x, y: hole.y }]
        : [hole, { x: hole.x, y: 2 * folded.h - hole.y }],
    );
  }
  return { holes, radius };
}

export function foldSvg(
  folds: number,
  punches: number,
  sidewaysFirst = false,
): string {
  // Panel k shows the paper before fold k; the last shows it punched.
  const sizes = foldedSizes(folds, sidewaysFirst, 250);
  // A sideways fold draws its arc beside the panel, so it needs more room
  // before the arrow to the next panel.
  const gapAfter = (panel: number): number =>
    panel >= folds ? 0 : creaseIsUpright(panel + 1, sidewaysFirst) ? 110 : 190;
  const total = sizes.reduce(
    (sum, size, panel) => sum + size.w + gapAfter(panel),
    0,
  );
  let x = (W - total) / 2;
  const middle = H / 2;
  let body = '';
  sizes.forEach((size, panel) => {
    const y = middle - size.h / 2;
    body += `<rect data-panel="${panel}" x="${round(x)}" y="${round(y)}" width="${size.w}" height="${size.h}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`;
    if (panel < folds) {
      // The fold about to happen: a dashed crease and an arrow over it.
      if (creaseIsUpright(panel + 1, sidewaysFirst)) {
        const crease = x + size.w / 2;
        body +=
          `<line x1="${round(crease)}" y1="${round(y)}" x2="${round(crease)}" y2="${round(y + size.h)}" stroke="${INK}" stroke-width="6" stroke-dasharray="16 14"/>` +
          `<path d="M${round(x + size.w - 30)} ${round(y - 22)} Q ${round(crease)} ${round(y - 92)} ${round(x + 30)} ${round(y - 22)}" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round"/>` +
          `<polygon points="${round(x + 30)},${round(y - 22)} ${round(x + 58)},${round(y - 30)} ${round(x + 38)},${round(y - 50)}" fill="${RED}"/>`;
      } else {
        const crease = y + size.h / 2;
        body +=
          `<line x1="${round(x)}" y1="${round(crease)}" x2="${round(x + size.w)}" y2="${round(crease)}" stroke="${INK}" stroke-width="6" stroke-dasharray="16 14"/>` +
          `<path d="M${round(x + size.w + 22)} ${round(y + size.h - 30)} Q ${round(x + size.w + 86)} ${round(crease)} ${round(x + size.w + 22)} ${round(y + 30)}" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round"/>` +
          `<polygon points="${round(x + size.w + 22)},${round(y + 30)} ${round(x + size.w + 30)},${round(y + 58)} ${round(x + size.w + 50)},${round(y + 38)}" fill="${RED}"/>`;
      }
      const arrowX = x + size.w + gapAfter(panel) - 52;
      body += `<path d="M${round(arrowX - 22)} ${middle} h44 m-18 -18 l18 18 l-18 18" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      const { spots, radius } = punchSpots(size, punches);
      for (const spot of spots) {
        body += `<circle data-hole="1" cx="${round(x + spot.x)}" cy="${round(y + spot.y)}" r="${round(radius)}" fill="${INK}"/>`;
      }
    }
    x += size.w + gapAfter(panel);
  });
  return frame(body);
}

/** The sheet opened flat again, with every hole the punches left in it. */
export function unfoldedSvg(
  folds: number,
  punches: number,
  sidewaysFirst = false,
): string {
  const base = 500;
  const x = (W - base) / 2;
  const y = (H - base) / 2;
  const { holes, radius } = unfoldedHoles(folds, punches, sidewaysFirst, base);
  return frame(
    `<rect data-panel="open" x="${x}" y="${y}" width="${base}" height="${base}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
      holes
        .map(
          (hole) =>
            `<circle data-hole="1" cx="${round(x + hole.x)}" cy="${round(y + hole.y)}" r="${round(radius)}" fill="${INK}"/>`,
        )
        .join(''),
  );
}

function composeFold(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`fold-and-punch:${variantKey}:${seed}`);
  const { folds, punches } = pick(FOLD_CASES, random);
  const sidewaysFirst = random() < 0.5;
  const holes = holesAfterUnfolding(folds, punches);
  const shared = {
    familyKey: 'fold-and-punch' as const,
    variantKey,
    variant: `folds-${folds}:punches-${punches}:${variantKey}:${sidewaysFirst ? 'sideways-first' : 'upright-first'}`,
  };

  if (variantKey === 'count-folds') {
    const { options, correctOptionId } = asOptions(
      FOLD_WORDS.slice(1),
      FOLD_WORDS[folds],
      random,
    );
    return {
      ...shared,
      prompt: `ورقة انطوت وانخرمت ${PUNCH_WORDS[punches]}، وبعدها انفتحت وصارت زي الصورة. كم مرة انطوت؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => {
          const guessed = FOLD_WORDS.indexOf(option.label);
          return {
            optionId: option.id,
            why: `${guessed} fold(s) would leave ${holesAfterUnfolding(guessed, punches)} holes, not the ${holes} drawn.`,
          };
        }),
      altText: 'ورقة مربعة مفتوحة فيها خروم',
      concept:
        'Read how many times a sheet was folded from the holes it shows once opened.',
      factualClaim: `${punches} punch(es) left ${holes} holes, so the sheet had ${2 ** folds} layers: ${folds} fold(s).`,
      svg: unfoldedSvg(folds, punches, sidewaysFirst),
    };
  }

  // What a player gets by a specific slip: seeing only the punches, or
  // forgetting one fold, or counting one fold too many.
  const slips = [
    {
      value: punches,
      why: 'Counts the holes as punched, without unfolding at all.',
    },
    { value: holes / 2, why: 'Forgets one of the folds: half the layers.' },
    { value: holes * 2, why: 'Counts one fold too many: twice the layers.' },
    {
      value: punches * (folds + 1),
      why: 'Adds a hole per fold instead of doubling.',
    },
  ].filter(
    (slip, index, all) =>
      slip.value !== holes &&
      slip.value >= 1 &&
      all.findIndex((other) => other.value === slip.value) === index,
  );
  const wrong = slips.slice(0, 3);
  const { options, correctOptionId } = asOptions(
    [holes, ...wrong.map((slip) => slip.value)].map(String),
    String(holes),
    random,
  );
  return {
    ...shared,
    prompt: `ورقة انطوت ${FOLD_WORDS[folds]} وانخرمت ${PUNCH_WORDS[punches]} زي الصورة. كم خرم فيها لما تنفتح؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why:
          wrong.find((slip) => String(slip.value) === option.label)?.why ?? '',
      })),
    altText: 'ورقة مربعة تُطوى ثم تُخرم، خطوة بخطوة',
    concept:
      'Count the holes a folded-and-punched sheet has once it is opened.',
    factualClaim: `${folds} fold(s) make ${2 ** folds} layers; ${punches} punch(es) through them leave ${holes} holes.`,
    svg: foldSvg(folds, punches, sidewaysFirst),
  };
}

// ---------------------------------------------------------------------------
// قوة الملاحظة — three families drawn from the library of things
// ---------------------------------------------------------------------------

/** A drawing that casts a shadow like too many others cannot be asked by it. */
const SHADOW_MAX_TWINS = 2;

/**
 * The right thing against two others of its own kind — never a twin of it,
 * so that no two options cast one shadow.
 */
function thingAmongItsKind(
  answer: DrawnThing,
  random: () => number,
): { options: Array<{ id: string; label: string }>; correctOptionId: string } {
  const others = shuffled(
    drawnThingsOf(answer.category).filter(
      (thing) => thing.key !== answer.key && !answer.twins.includes(thing.key),
    ),
    random,
  ).slice(0, 3);
  return asOptions(
    [answer.ar, ...others.map((thing) => thing.ar)],
    answer.ar,
    random,
  );
}

/**
 * Where each tile of a cut-up drawing is dealt: `order[place]` is the tile
 * shown there. No tile stays in its own place, and none keeps its neighbour
 * to the right — the picture must be put together, not read.
 */
export function shatteredOrder(
  columns: number,
  rows: number,
  detail: number,
): number[] {
  const random = seededRandom(`shattered:${columns}x${rows}:${detail}`);
  const tiles = Array.from({ length: columns * rows }, (_, index) => index);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const order = shuffled(tiles, random);
    const displaced = order.every((source, place) => source !== place);
    const brokenUp = order.every(
      (source, place) =>
        (place + 1) % columns === 0 ||
        source % columns === columns - 1 ||
        order[place + 1] !== source + 1,
    );
    if (displaced && brokenUp) return order;
  }
  // A plain rotation of the tiles: always displaced.
  return tiles.map((index) => (index + 1) % tiles.length);
}

export function fragmentSvg(
  thing: DrawnThing,
  variantKey: string,
  detail: number,
): string {
  const size = 440;
  const cx = W / 2;
  const cy = H / 2;
  const x = cx - size / 2;
  const y = cy - size / 2;
  const card = (inside: string) =>
    `<rect x="${x - 30}" y="${y - 30}" width="${size + 60}" height="${size + 60}" rx="36" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>${inside}`;
  if (variantKey === 'shadow') {
    return frame(
      card(
        `<g data-thing="${thing.key}">${thingSilhouetteSvg(thing, cx, cy, size, INK)}</g>`,
      ),
    );
  }
  if (variantKey === 'close-up') {
    // A window half the drawing wide, somewhere around its middle.
    const windows = [
      [8, 8],
      [5, 7],
      [11, 7],
      [7, 11],
      [10, 10],
    ];
    const [left, top] = windows[detail % windows.length];
    return frame(
      card(
        `<svg data-thing="${thing.key}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${left} ${top} 16 16" fill="none">${thing.body}</svg>`,
      ),
    );
  }
  if (variantKey === 'upside-down') {
    return frame(
      card(
        `<g data-thing="${thing.key}" transform="translate(0 ${round(2 * cy)}) scale(1 -1)">${thingSvg(thing, cx, cy, size)}</g>`,
      ),
    );
  }
  if (variantKey === 'shattered') {
    // Cut into four or six tiles and dealt back with every tile out of
    // place. No finer: a drawing does not fill its corners, and a grid of
    // nine leaves tiles with nothing on them.
    const columns = detail % 2 ? 3 : 2;
    const rows = 2;
    const order = shatteredOrder(columns, rows, detail);
    const gap = 14;
    const wide = (size - (columns - 1) * gap) / columns;
    const tall = (size - (rows - 1) * gap) / rows;
    let tiles = '';
    order.forEach((source, place) => {
      const tx = x + (place % columns) * (wide + gap);
      const ty = y + Math.floor(place / columns) * (tall + gap);
      tiles +=
        `<g data-tile="${place}" data-from="${source}">` +
        `<rect x="${round(tx)}" y="${round(ty)}" width="${round(wide)}" height="${round(tall)}" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
        `<svg x="${round(tx)}" y="${round(ty)}" width="${round(wide)}" height="${round(tall)}" viewBox="${round((source % columns) * (32 / columns))} ${round(Math.floor(source / columns) * (32 / rows))} ${round(32 / columns)} ${round(32 / rows)}" preserveAspectRatio="none" fill="none">${thing.body}</svg></g>`;
    });
    return frame(
      `<rect x="${x - 30}" y="${y - 30}" width="${size + 60}" height="${size + 60}" rx="36" fill="${GOLD}" stroke="${INK}" stroke-width="10"/>` +
        `<g data-thing="${thing.key}">${tiles}</g>`,
    );
  }
  // Half of it behind a wall: left, right, top or bottom.
  const side = detail % 4;
  const wall =
    side === 0
      ? [x - 30, y - 30, size / 2 + 30, size + 60]
      : side === 1
        ? [cx, y - 30, size / 2 + 30, size + 60]
        : side === 2
          ? [x - 30, y - 30, size + 60, size / 2 + 30]
          : [x - 30, cy, size + 60, size / 2 + 30];
  return frame(
    card(
      `<g data-thing="${thing.key}">${thingSvg(thing, cx, cy, size)}</g>` +
        `<rect data-wall="${side}" x="${wall[0]}" y="${wall[1]}" width="${wall[2]}" height="${wall[3]}" rx="36" fill="${INK}"/>`,
    ),
  );
}

function composeFragment(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`visual-closure-fragment:${variantKey}:${seed}`);
  const thing = pick(
    drawnThings().filter(
      (entry) =>
        entry.category !== 'place' &&
        (variantKey !== 'shadow' || entry.twins.length <= SHADOW_MAX_TWINS) &&
        // Cut into tiles, a thin drawing leaves tiles with nothing on them:
        // only well-filled drawings are cut up.
        (variantKey !== 'shattered' || entry.twins.length >= 1),
    ),
    random,
  );
  const detail = Math.floor(random() * 20);
  const { options, correctOptionId } = thingAmongItsKind(thing, random);
  return {
    familyKey: 'visual-closure-fragment',
    variantKey,
    variant: `${variantKey}:${thing.key}:${detail}`,
    prompt:
      variantKey === 'shadow'
        ? 'هذا ظل وش؟'
        : variantKey === 'close-up'
          ? 'هذي صورة مقرّبة من وش؟'
          : variantKey === 'upside-down'
            ? 'الرسمة مقلوبة فوق تحت. وش هي؟'
            : variantKey === 'shattered'
              ? 'الرسمة مقطّعة ومتلخبطة. وش هي؟'
              : 'نصّه مغطّى. وش هو؟',
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why: 'A thing of the same kind, so it is a fair guess from a glance — but its outline and details are not the ones shown.',
      })),
    altText:
      variantKey === 'shadow'
        ? 'ظل أسود لشيء معروف'
        : variantKey === 'close-up'
          ? 'جزء مقرّب من رسمة شيء معروف'
          : variantKey === 'upside-down'
            ? 'رسمة شيء معروف مقلوبة رأسًا على عقب'
            : variantKey === 'shattered'
              ? 'رسمة شيء معروف مقطّعة إلى مربعات متلخبطة'
              : 'رسمة شيء معروف نصفها مغطّى',
    concept:
      'Recognise an everyday thing from part of what would normally identify it.',
    factualClaim: `The drawing shown is "${thing.key}" («${thing.ar}»).`,
    svg: fragmentSvg(thing, variantKey, detail),
  };
}

/** Things laid on a grid of cells; `null` leaves a cell empty. */
function thingGridSvg(
  cells: ReadonlyArray<DrawnThing | null>,
  columns: number,
  box: { x: number; y: number; cell: number; thing: number },
): string {
  return cells
    .map((thing, index) =>
      thing
        ? `<g data-cell="${index}" data-thing="${thing.key}">${thingSvg(
            thing,
            box.x + (index % columns) * box.cell + box.cell / 2,
            box.y + Math.floor(index / columns) * box.cell + box.cell / 2,
            box.thing,
          )}</g>`
        : '',
    )
    .join('');
}

/** Distinct things for one picture, of every kind mixed. */
const castOfThings = (count: number, random: () => number): DrawnThing[] =>
  shuffled(
    drawnThings().filter((thing) => thing.category !== 'place'),
    random,
  ).slice(0, count);

/**
 * Two pictures side by side — the first on the right, as Arabic reads — each
 * a 3×3 board, numbered so the question can name the second.
 */
export function twoBoardsSvg(
  first: ReadonlyArray<DrawnThing | null>,
  second: ReadonlyArray<DrawnThing | null>,
): string {
  const board = (x: number, number: string, cells: typeof first) =>
    `<g data-board="${number}">` +
    `<rect x="${x}" y="100" width="510" height="510" rx="32" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
    thingGridSvg(cells, 3, { x, y: 100, cell: 170, thing: 124 }) +
    `<circle cx="${x + 255}" cy="52" r="36" fill="${GOLD}" stroke="${INK}" stroke-width="8"/>` +
    `<text x="${x + 255}" y="67" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="42" fill="${INK}">${number}</text>` +
    `</g>`;
  return frame(board(640, '1', first) + board(50, '2', second));
}

function composeDifference(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`spot-the-difference:${variantKey}:${seed}`);
  const cast = castOfThings(10, random);
  const kept = cast.slice(0, 8);
  const [, , , , , , , , odd, newcomer] = cast;
  let first: Array<DrawnThing | null>;
  let second: Array<DrawnThing | null>;
  let answer: DrawnThing;
  let tempting: DrawnThing[];
  let prompt: string;
  let rationale: string;
  let claim: string;
  if (variantKey === 'appeared') {
    // Eight things, then the same eight moved around with a ninth among them.
    first = shuffled([...kept, null], random);
    second = shuffled([...kept, odd], random);
    answer = odd;
    tempting = shuffled(kept, random).slice(0, 3);
    prompt = 'وش الشي الجديد اللي انضاف في الصورة 2؟';
    rationale = 'It is in both pictures; it only moved to another place.';
    claim = `"${odd.key}" is in picture 2 and not in picture 1.`;
  } else if (variantKey === 'replaced') {
    // Nothing moves; one thing gives its place to another.
    first = shuffled([...kept, odd], random);
    second = first.map((thing) => (thing === odd ? newcomer : thing));
    answer = odd;
    tempting = [newcomer, ...shuffled(kept, random).slice(0, 2)];
    prompt = 'أي واحد من الصورة 1 انبدل بشي ثاني في الصورة 2؟';
    rationale =
      'Either the thing that took the place — it is what arrived, not what left — or one that is unchanged in both pictures.';
    claim = `"${odd.key}" in picture 1 was replaced by "${newcomer.key}" in picture 2.`;
  } else {
    // Nine things, then eight of them moved around: one is gone.
    first = shuffled([...kept, odd], random);
    second = shuffled([...kept, null], random);
    answer = odd;
    tempting = shuffled(kept, random).slice(0, 3);
    prompt = 'وش اللي اختفى في الصورة 2؟';
    rationale = 'It is still in picture 2; it only moved to another place.';
    claim = `"${odd.key}" is in picture 1 and not in picture 2.`;
  }
  const { options, correctOptionId } = asOptions(
    [answer.ar, ...tempting.map((thing) => thing.ar)],
    answer.ar,
    random,
  );
  return {
    familyKey: 'spot-the-difference',
    variantKey,
    variant: `${variantKey}:${answer.key}`,
    prompt,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({ optionId: option.id, why: rationale })),
    altText:
      'صورتان مرقّمتان في كل واحدة مجموعة أشياء مرسومة، وبينهما فرق واحد',
    concept:
      'Compare two boards of drawn things and name the one thing that differs.',
    factualClaim: claim,
    svg: twoBoardsSvg(first, second),
  };
}

/**
 * «كم شي تغيّر؟» — the same board twice, nothing moved, and one to four
 * squares changed: a thing gone, a thing come, or one thing for another.
 */
function composeCountChanges(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`count-changes:${variantKey}:${seed}`);
  const answer = 1 + Math.floor(random() * 4);
  const sameKind = variantKey === 'same-kind';
  for (;;) {
    const cast = castOfThings(14, random);
    const first: Array<DrawnThing | null> = shuffled(
      [...cast.slice(0, 7), null, null],
      random,
    );
    const spare = cast.slice(7);
    const second = [...first];
    const changed = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8], random).slice(
      0,
      answer,
    );
    const kinds: string[] = [];
    let ok = true;
    for (const index of changed) {
      const before = first[index];
      if (!before) {
        second[index] = spare.pop()!;
        kinds.push('appeared');
        continue;
      }
      const swap = sameKind
        ? spare.find((thing) => thing.category === before.category)
        : random() < 0.5
          ? spare[spare.length - 1]
          : undefined;
      if (sameKind && !swap) {
        ok = false;
        break;
      }
      if (swap) {
        spare.splice(spare.indexOf(swap), 1);
        second[index] = swap;
        kinds.push('replaced');
      } else {
        second[index] = null;
        kinds.push('vanished');
      }
    }
    if (!ok) continue;
    const options = [1, 2, 3, 4].map((count, index) => ({
      id: ['a', 'b', 'c', 'd'][index],
      label: String(count),
    }));
    const correctOptionId = options[answer - 1].id;
    return {
      familyKey: 'count-changes',
      variantKey,
      variant: `${variantKey}:${answer}:${kinds.join(',')}`,
      prompt: 'كم شي تغيّر بين الصورتين؟ (اختفى، انضاف، أو تبدّل بغيره)',
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: `Exactly ${answer} squares differ between the two boards.`,
        })),
      altText: 'صورتان مرقّمتان فيهما نفس الأشياء في نفس الأماكن مع تغييرات',
      concept:
        'Compare two boards square by square and count the squares that differ.',
      factualClaim: `${answer} squares differ: ${kinds.join(', ')}.`,
      svg: twoBoardsSvg(first, second),
    };
  }
}

export function scanBoardSvg(cells: ReadonlyArray<DrawnThing | null>): string {
  return frame(
    `<rect x="70" y="27" width="1060" height="621" rx="36" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
      thingGridSvg(cells, 5, { x: 100, y: 37, cell: 200, thing: 140 }),
  );
}

function composeScan(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`visual-match-scan:${variantKey}:${seed}`);
  let cells: DrawnThing[];
  let answer: DrawnThing;
  let tempting: DrawnThing[];
  let prompt: string;
  let rationale: string;
  let claim: string;
  if (variantKey === 'absent') {
    // Fifteen things on the board; the answer is one of its kind that is not.
    const cast = castOfThings(15, random);
    const [like] = cast;
    answer = pick(
      drawnThingsOf(like.category).filter((thing) => !cast.includes(thing)),
      random,
    );
    cells = shuffled(cast, random);
    tempting = [like, cast[1], cast[2]];
    prompt = 'أي واحد من هذول مو موجود في الصورة؟';
    rationale = 'It is on the board, among the other things.';
    claim = `"${answer.key}" is not on the board; the other two options are.`;
  } else if (variantKey === 'no-twin') {
    // Seven pairs and one thing on its own.
    const cast = castOfThings(8, random);
    answer = cast[0];
    cells = shuffled([...cast, ...cast.slice(1)], random);
    tempting = cast.slice(1, 4);
    prompt = 'كل رسمة لها توأم إلا وحدة. أي وحدة؟';
    rationale = 'It appears twice on the board; its twin is farther away.';
    claim = `"${answer.key}" appears once; every other drawing appears twice.`;
  } else {
    // Fourteen different things and one of them a second time.
    const cast = castOfThings(14, random);
    answer = cast[0];
    cells = shuffled([...cast, answer], random);
    tempting = cast.slice(1, 4);
    prompt = 'أي رسمة تكررت مرتين في الصورة؟';
    rationale = 'It appears once only.';
    claim = `"${answer.key}" appears twice; every other drawing appears once.`;
  }
  const { options, correctOptionId } = asOptions(
    [answer.ar, ...tempting.map((thing) => thing.ar)],
    answer.ar,
    random,
  );
  return {
    familyKey: 'visual-match-scan',
    variantKey,
    variant: `${variantKey}:${answer.key}`,
    prompt,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({ optionId: option.id, why: rationale })),
    altText: 'لوحة فيها خمس عشرة رسمة لأشياء معروفة',
    concept:
      'Scan a board of drawn things for the one that repeats, stands alone, or is missing.',
    factualClaim: claim,
    svg: scanBoardSvg(cells),
  };
}

export const isComposedPuzzleFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedPuzzleFamily =>
  (COMPOSED_PUZZLE_FAMILIES as readonly string[]).includes(familyKey ?? '');

/**
 * Compose one puzzle. `variantKey` is the template the slot was given; left
 * out (or unknown), the seed chooses one.
 */
export function composePuzzle(
  familyKey: ComposedPuzzleFamily,
  seed: string,
  variantKey?: string,
): ComposedPuzzle {
  const variant = chooseVariant(familyKey, seed, variantKey);
  if (familyKey in PATHS_VARIANTS) {
    return composePaths(
      familyKey as PathsFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey in WORDLE_VARIANTS) {
    return composeWordle(
      familyKey as WordleFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey in ERRORS_VARIANTS) {
    return composeErrors(
      familyKey as ErrorsFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey in RYO_VARIANTS) {
    return composeRyo(familyKey as RyoFamily, seed, variant) as ComposedPuzzle;
  }
  if (familyKey in LETTERS_VARIANTS) {
    return composeLetters(
      familyKey as LettersFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey in OBSERVATION_VARIANTS) {
    return composeObservation(
      familyKey as ObservationFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey in ASSEMBLY_VARIANTS) {
    return composeAssembly(
      familyKey as AssemblyFamily,
      seed,
      variant,
    ) as ComposedPuzzle;
  }
  if (familyKey === 'wire-trace-terminal') return composeThreads(seed, variant);
  if (familyKey === 'opposite-cube-faces') return composeCubeNet(seed, variant);
  if (familyKey === 'fold-and-punch') return composeFold(seed, variant);
  if (familyKey === 'visual-closure-fragment') {
    return composeFragment(seed, variant);
  }
  if (familyKey === 'spot-the-difference') {
    return composeDifference(seed, variant);
  }
  if (familyKey === 'count-changes') {
    return composeCountChanges(seed, variant);
  }
  return composeScan(seed, variant);
}
