import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  INK,
  RED,
  W,
  H,
  frame,
  pick,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';
import { LETTER_WORDS, lendersFor, lettersSvg } from './composed-letters';
import {
  THREAD_LAYOUTS,
  THREAD_STARTS,
  ThreadStation,
  fragmentSvg,
  routeThreads,
  threadsSvg,
} from './composed-puzzles';
import {
  DrawnThing,
  drawnThings,
  findDrawnThingsDirectory,
  thingSvg,
  toThe,
} from './drawn-things';

/**
 * القنبلة in عالم الألغاز: one drawing, one typed answer, read in a glance.
 * The answer is never a guess at what a player calls the thing: only
 * drawings listed in `bomb-names.txt` are asked by name, with every name a
 * player may type for them.
 */
export const BOMB_VARIANTS = {
  'bomb-dice-total': ['two-dice', 'three-dice'],
  'bomb-first-letters': ['in-order', 'scrambled'],
  'bomb-what-is-it': ['shadow', 'close-up', 'half-hidden', 'upside-down'],
  'bomb-put-together': ['shattered', 'shattered-fine'],
  'bomb-thread-end': ['three-threads', 'four-threads'],
  'bomb-odd-one-out': ['five-things', 'six-things'],
} as const;

export type BombFamily = keyof typeof BOMB_VARIANTS;

export const COMPOSED_BOMB_FAMILIES = Object.keys(
  BOMB_VARIANTS,
) as BombFamily[];

export const isComposedBombFamily = (
  familyKey: string | null | undefined,
): familyKey is BombFamily =>
  Object.prototype.hasOwnProperty.call(BOMB_VARIANTS, familyKey ?? '');

export interface ComposedBombItem {
  familyKey: BombFamily;
  variantKey: string;
  variant: string;
  prompt: string;
  acceptedAnswers: string[];
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

let names: ReadonlyMap<string, string[]> | undefined;

/** Every name a player may type for each drawing asked by name. */
export function bombNames(): ReadonlyMap<string, string[]> {
  if (names) return names;
  const map = new Map<string, string[]>();
  try {
    const directory = findDrawnThingsDirectory();
    const file = directory ? join(directory, 'bomb-names.txt') : '';
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        const [key, ...forms] = line.split('|').map((part) => part.trim());
        if (key && forms.length) map.set(key, forms.filter(Boolean));
      }
    }
  } catch {
    // No list, no named drawings: the families that need one draw nothing.
  }
  names = map;
  return names;
}

/** The drawings a Bomb item may ask the name of. */
export const namedThings = (): DrawnThing[] =>
  drawnThings().filter((thing) => bombNames().has(thing.key));

const answersFor = (thing: DrawnThing): string[] =>
  bombNames().get(thing.key)!.slice(0, 10);

const NUMBER_WORDS = [
  '',
  'واحد',
  'اثنين',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
];

/** How the teens are said aloud, and typed by most. */
const SPOKEN_TEENS: Record<number, string> = {
  11: 'احدعش',
  12: 'اثنعش',
  13: 'ثلطعش',
  14: 'اربعطعش',
  15: 'خمسطعش',
  16: 'سطعش',
  17: 'سبعطعش',
  18: 'ثمنطعش',
};

/** A number as it may be typed: Western digits, Arabic digits, the word. */
export const numberAnswers = (value: number): string[] => [
  String(value),
  String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]),
  NUMBER_WORDS[value],
  ...(value === 2 ? ['اثنان'] : []),
  ...(SPOKEN_TEENS[value] ? [SPOKEN_TEENS[value]] : []),
];

// ---------------------------------------------------------------------------

const PIPS: Record<number, Array<[number, number]>> = {
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

const dieSvg = (
  face: number,
  cx: number,
  cy: number,
  size: number,
  tilt: number,
) =>
  `<g data-die="${face}" transform="rotate(${tilt} ${cx} ${cy})"><rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" rx="${size * 0.16}" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
  PIPS[face]
    .map(
      ([dx, dy]) =>
        `<circle cx="${round(cx + dx * size * 0.27)}" cy="${round(cy + dy * size * 0.27)}" r="${round(size * 0.09)}" fill="${face === 1 ? RED : INK}"/>`,
    )
    .join('') +
  `</g>`;

function diceTotal(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-dice-total:${variantKey}:${seed}`);
  const count = variantKey === 'three-dice' ? 3 : 2;
  const faces = Array.from(
    { length: count },
    () => 1 + Math.floor(random() * 6),
  );
  const total = faces.reduce((a, b) => a + b, 0);
  const size = 220;
  let body = '';
  faces.forEach((face, index) => {
    const cx = W / 2 + ((count - 1) / 2 - index) * (size + 70);
    body += dieSvg(face, cx, H / 2, size, pick([-12, -6, 0, 6, 12], random));
  });
  return {
    familyKey: 'bomb-dice-total',
    variantKey,
    variant: `${variantKey}:${faces.join('+')}`,
    prompt: 'كم مجموع النرد؟',
    acceptedAnswers: numberAnswers(total),
    altText: `${count === 3 ? 'ثلاث' : 'حبتين'} نرد على وجوه مختلفة`,
    concept: 'Add the pips on the dice at a glance.',
    factualClaim: `Faces ${faces.join(' + ')} = ${total}.`,
    svg: frame(body),
  };
}

/**
 * Drawings a player might call by a name with another first letter (an
 * eagle is «نسر» to one and «صقر» to another): never lent a letter here.
 */
function unsureFirstLetter(): Set<string> {
  return new Set(
    drawnThings()
      .filter((thing) => {
        const forms = bombNames().get(thing.key);
        if (!forms) return true;
        const first = (form: string) =>
          form.replace(/^ال/, '').replace(/^[أإآ]/, 'ا')[0];
        return new Set(forms.map(first)).size > 1;
      })
      .map((thing) => thing.key),
  );
}

function firstLetters(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-first-letters:${variantKey}:${seed}`);
  for (const word of shuffled(
    LETTER_WORDS.filter((w) => w.length === 3),
    random,
  )) {
    const lenders = lendersFor(word, () => [1], random, unsureFirstLetter());
    if (!lenders) continue;
    let row = lenders;
    if (variantKey === 'scrambled') {
      do row = shuffled(lenders, random);
      while (row.every((lender, index) => lender === lenders[index]));
    }
    return {
      familyKey: 'bomb-first-letters',
      variantKey,
      variant: `${variantKey}:${word}`,
      prompt:
        variantKey === 'scrambled'
          ? 'أول حرف من كل رسمة، ورتّبها. وش الكلمة؟'
          : 'أول حرف من كل رسمة، من اليمين. وش الكلمة؟',
      acceptedAnswers: [word],
      altText: 'ثلاث رسمات في صف',
      concept: 'Take the first letter of each drawn thing and read the word.',
      factualClaim: `${lenders.map((l) => l.thing.ar).join(', ')} → «${word}».`,
      svg: lettersSvg(
        row.map((lender) => lender.thing),
        { ordered: variantKey !== 'scrambled' },
      ),
    };
  }
  throw new Error('bomb-first-letters: no word could be spelled');
}

function whatIsIt(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-what-is-it:${variantKey}:${seed}`);
  const thing = pick(
    namedThings().filter(
      (entry) => variantKey !== 'shadow' || entry.twins.length <= 2,
    ),
    random,
  );
  const detail = Math.floor(random() * 20);
  const prompts: Record<string, string> = {
    shadow: 'ظل أي شي هذا؟',
    'close-up': 'جزء مكبّر من شي. وش هو؟',
    'half-hidden': 'نصه مغطى. وش هو؟',
    'upside-down': 'مقلوب. وش هو؟',
  };
  return {
    familyKey: 'bomb-what-is-it',
    variantKey,
    variant: `${variantKey}:${thing.key}:${detail}`,
    prompt: prompts[variantKey],
    acceptedAnswers: answersFor(thing),
    altText: 'رسمة لشي معروف، مخفي جزء منها',
    concept: 'Name a familiar thing from part of its drawing.',
    factualClaim: `The drawing is of «${thing.ar}».`,
    svg: fragmentSvg(thing, variantKey, detail),
  };
}

function putTogether(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-put-together:${variantKey}:${seed}`);
  // Only well-filled drawings are cut up: a thin one leaves empty tiles.
  const thing = pick(
    namedThings().filter((entry) => entry.twins.length >= 1),
    random,
  );
  // Four tiles on an even detail, six on an odd one.
  const detail =
    2 * Math.floor(random() * 10) + (variantKey === 'shattered-fine' ? 1 : 0);
  return {
    familyKey: 'bomb-put-together',
    variantKey,
    variant: `${variantKey}:${thing.key}:${detail}`,
    prompt: 'رسمة متكسّرة. وش هي؟',
    acceptedAnswers: answersFor(thing),
    altText: 'رسمة لشي معروف مقطعة قطع متلخبطة',
    concept:
      'Put a cut-up or turned drawing back together in the head and name it.',
    factualClaim: `The drawing is of «${thing.ar}».`,
    svg: fragmentSvg(thing, 'shattered', detail),
  };
}

function threadEnd(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-thread-end:${variantKey}:${seed}`);
  const threads = variantKey === 'four-threads' ? 4 : 3;
  const layout = pick(
    THREAD_LAYOUTS.filter((entry) => entry.threads === threads),
    random,
  );
  const routing = routeThreads(random, threads);
  const starts: ThreadStation[] = shuffled(THREAD_STARTS, random)
    .slice(0, threads)
    .map((start) => ({
      key: start.key,
      name: start.name,
      inQuestion: `الدائرة ${start.name}`,
      to: `للدائرة ${start.name}`,
      colour: start.colour,
    }));
  const things = shuffled(namedThings(), random).slice(0, threads);
  const ends: ThreadStation[] = things.map((thing) => ({
    key: thing.key,
    name: thing.the,
    inQuestion: thing.the,
    to: toThe(thing.the),
    thing,
  }));
  const asked = Math.floor(random() * threads);
  const reached = things[routing.endOf[asked]];
  return {
    familyKey: 'bomb-thread-end',
    variantKey,
    variant: `${variantKey}:${layout.key}:${starts[asked].key}:${reached.key}`,
    prompt: `خيط ${starts[asked].inQuestion} وش في آخره؟`,
    acceptedAnswers: answersFor(reached),
    altText: 'دوائر ملونة تخرج منها خيوط متشابكة إلى رسمات',
    concept: 'Follow one coloured thread to its end and name the thing there.',
    factualClaim: `The ${starts[asked].key} thread was routed to «${reached.ar}».`,
    svg: threadsSvg(routing, ends, { layout, starts }),
  };
}

function oddOneOut(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-odd-one-out:${variantKey}:${seed}`);
  const count = variantKey === 'six-things' ? 6 : 5;
  const pool = drawnThings().filter((thing) => thing.category !== 'place');
  for (;;) {
    // The crowd is of a kind nobody argues about; the intruder of another.
    const crowdKind = pick(['animal', 'food', 'vehicle'], random);
    const kinds = [
      crowdKind,
      pick(
        ['animal', 'food', 'vehicle', 'object'].filter(
          (kind) => kind !== crowdKind,
        ),
        random,
      ),
    ];
    const crowd = pool.filter((thing) => thing.category === kinds[0]);
    const odd = namedThings().filter((thing) => thing.category === kinds[1]);
    if (crowd.length < count - 1 || !odd.length) continue;
    const intruder = pick(odd, random);
    const row = shuffled(
      [...shuffled(crowd, random).slice(0, count - 1), intruder],
      random,
    );
    const card = count === 6 ? 160 : 180;
    const span = count * card + (count - 1) * 24;
    let body = '';
    row.forEach((thing, index) => {
      const x = (W + span) / 2 - card - index * (card + 24);
      const y = (H - card) / 2;
      body +=
        `<g data-slot="${index}" data-thing="${thing.key}"><rect x="${round(x)}" y="${round(y)}" width="${card}" height="${card}" rx="26" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>` +
        thingSvg(thing, x + card / 2, y + card / 2, round(card * 0.72)) +
        `</g>`;
    });
    return {
      familyKey: 'bomb-odd-one-out',
      variantKey,
      variant: `${variantKey}:${kinds[0]}:${intruder.key}`,
      prompt: 'وش اللي ما ينتمي للباقي؟',
      acceptedAnswers: answersFor(intruder),
      altText: 'صف رسمات من نوع واحد إلا وحدة',
      concept: 'Name the one drawing that is not of the same kind as the rest.',
      factualClaim: `All are ${kinds[0]} but «${intruder.ar}» (${kinds[1]}).`,
      svg: frame(body),
    };
  }
}

export function composeBomb(
  familyKey: BombFamily,
  seed: string,
  variantKey?: string,
): ComposedBombItem {
  const variants = BOMB_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'bomb-dice-total':
      return diceTotal(seed, chosen);
    case 'bomb-first-letters':
      return firstLetters(seed, chosen);
    case 'bomb-what-is-it':
      return whatIsIt(seed, chosen);
    case 'bomb-put-together':
      return putTogether(seed, chosen);
    case 'bomb-thread-end':
      return threadEnd(seed, chosen);
    default:
      return oddOneOut(seed, chosen);
  }
}
