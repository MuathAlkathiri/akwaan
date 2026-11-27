import { existsSync, readFileSync } from 'fs';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { join } from 'path';
import {
  INK,
  W,
  H,
  frame,
  pick,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';
import {
  NUMBER_BOMB_VARIANTS,
  composeNumberBomb,
} from './composed-bomb-numbers';
import { LETTER_WORDS, lendersFor, lettersSvg } from './composed-letters';
import {
  shatteredOrder,
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
  'bomb-number-puzzles': NUMBER_BOMB_VARIANTS,
  'bomb-first-letters': ['in-order', 'scrambled'],
  'bomb-what-is-it': ['shadow', 'close-up', 'half-hidden', 'upside-down'],
  'bomb-put-together': ['shattered-turned', 'mirrored-word'],
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
  ...(NUMBER_WORDS[value] ? [NUMBER_WORDS[value]] : []),
  ...(value === 2 ? ['اثنان'] : []),
  ...(SPOKEN_TEENS[value] ? [SPOKEN_TEENS[value]] : []),
];

// ---------------------------------------------------------------------------

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

/**
 * Cut into four or six tiles, dealt out of place, and some tiles turned: the
 * drawing has to be put back together and set upright in the head.
 */
export function shatteredTurnedSvg(
  thing: DrawnThing,
  detail: number,
  random: () => number,
): { svg: string; turned: number } {
  const size = 440;
  const x = W / 2 - size / 2;
  const y = H / 2 - size / 2;
  const columns = detail % 2 ? 3 : 2;
  const rows = 2;
  const order = shatteredOrder(columns, rows, detail);
  const gap = 14;
  const wide = (size - (columns - 1) * gap) / columns;
  const tall = (size - (rows - 1) * gap) / rows;
  // Square tiles turn a quarter or a half; tall ones only a half.
  const turns: number[] = order.map((): number =>
    random() < 0.5 ? 0 : columns === 2 ? pick([90, 180, 270], random) : 180,
  );
  if (!turns.some((turn) => turn !== 0)) turns[0] = columns === 2 ? 90 : 180;
  let tiles = '';
  order.forEach((source, place) => {
    const tx = x + (place % columns) * (wide + gap);
    const ty = y + Math.floor(place / columns) * (tall + gap);
    const cx = tx + wide / 2;
    const cy = ty + tall / 2;
    tiles +=
      `<g data-tile="${place}" data-from="${source}" data-turn="${turns[place]}" transform="rotate(${turns[place]} ${round(cx)} ${round(cy)})">` +
      `<rect x="${round(tx)}" y="${round(ty)}" width="${round(wide)}" height="${round(tall)}" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
      `<svg x="${round(tx)}" y="${round(ty)}" width="${round(wide)}" height="${round(tall)}" viewBox="${round((source % columns) * (32 / columns))} ${round(Math.floor(source / columns) * (32 / rows))} ${round(32 / columns)} ${round(32 / rows)}" preserveAspectRatio="none" fill="none">${thing.body}</svg></g>`;
  });
  return {
    svg: frame(
      `<rect x="${x - 30}" y="${y - 30}" width="${size + 60}" height="${size + 60}" rx="36" fill="#E8B33A" stroke="${INK}" stroke-width="10"/>` +
        `<g data-thing="${thing.key}">${tiles}</g>`,
    ),
    turned: turns.filter((turn) => turn !== 0).length,
  };
}

function putTogether(seed: string, variantKey: string): ComposedBombItem {
  const random = seededRandom(`bomb-put-together:${variantKey}:${seed}`);
  if (variantKey === 'mirrored-word') {
    const thing = pick(namedThings(), random);
    const word = answersFor(thing)[0];
    const mirror = random() < 0.5;
    const size = [...word].length > 6 ? 120 : 160;
    return {
      familyKey: 'bomb-put-together',
      variantKey,
      variant: `${variantKey}:${thing.key}:${mirror ? 'mirror' : 'upside-down'}`,
      prompt: mirror
        ? 'كلمة في المراية. وش هي؟'
        : 'كلمة مقلوبة على راسها. وش هي؟',
      acceptedAnswers: answersFor(thing),
      altText: mirror ? 'كلمة مكتوبة بالمعكوس' : 'كلمة مكتوبة مقلوبة',
      concept: 'Read a word turned upside down or seen in a mirror.',
      factualClaim: `The word is «${word}», drawn ${mirror ? 'mirrored' : 'upside down'}.`,
      svg: frame(
        `<rect x="150" y="150" width="900" height="375" rx="36" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
          `<g data-word="${thing.key}" transform="${mirror ? `translate(${W} 0) scale(-1 1)` : `rotate(180 ${W / 2} ${H / 2})`}">` +
          `<text x="${W / 2}" y="${H / 2 + size * 0.35}" text-anchor="middle" font-family="Noto Kufi Arabic" font-weight="700" font-size="${size}" fill="${INK}">${word}</text></g>`,
      ),
    };
  }
  // Only well-filled drawings are cut up: a thin one leaves empty tiles.
  const thing = pick(
    namedThings().filter((entry) => entry.twins.length >= 1),
    random,
  );
  const detail = Math.floor(random() * 20);
  const { svg, turned } = shatteredTurnedSvg(thing, detail, random);
  return {
    familyKey: 'bomb-put-together',
    variantKey,
    variant: `${variantKey}:${thing.key}:${detail}:${turned}`,
    prompt: 'ركّب القطع وعدّل المدوّر منها. وش تطلع الرسمة؟',
    acceptedAnswers: answersFor(thing),
    altText: 'رسمة لشي معروف مقطعة قطع متلخبطة وبعضها مدوّر',
    concept:
      'Put a cut-up drawing together, turning the turned tiles back, and name it.',
    factualClaim: `The drawing is of «${thing.ar}»; ${turned} tile(s) are turned.`,
    svg,
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

/**
 * The answers the game will compare: two spellings the game already folds
 * together (فأر and فار) are one answer, and the game refuses both kept.
 */
export function distinctAnswers(answers: readonly string[]): string[] {
  const seen = new Set<string>();
  return answers.filter((answer) => {
    const key = normalizeAnswer(answer);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const item = drawBomb(familyKey, seed, chosen);
  return { ...item, acceptedAnswers: distinctAnswers(item.acceptedAnswers) };
}

function drawBomb(
  familyKey: BombFamily,
  seed: string,
  chosen: string,
): ComposedBombItem {
  switch (familyKey) {
    case 'bomb-number-puzzles': {
      const puzzle = composeNumberBomb(seed, chosen);
      return {
        familyKey,
        variantKey: puzzle.variantKey,
        variant: puzzle.variant,
        prompt: puzzle.prompt,
        acceptedAnswers: numberAnswers(puzzle.answer),
        altText: puzzle.altText,
        concept: puzzle.concept,
        factualClaim: puzzle.factualClaim,
        svg: puzzle.svg,
      };
    }
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
