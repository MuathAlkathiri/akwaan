import {
  ComposedPuzzleDrawing,
  H,
  INK,
  W,
  frame,
  letterBadge,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';
import { DrawnThing, drawnThings, thingSvg } from './drawn-things';

/**
 * «أول حرف» — a word spelled by drawn things, one letter from the name of
 * each. Naming the pictures is the easy half; every template adds a second
 * step, so it is never the nursery version (first letters, in order). The
 * word is typed: offered among options it would be found by matching letters.
 */
export const LETTERS_VARIANTS = {
  'picture-initials': ['scrambled', 'last-letter', 'cipher'],
} as const;

export type LettersFamily = keyof typeof LETTERS_VARIANTS;

/**
 * Names nobody would spell or say another way: one word, plain letters, and
 * not a borrowed word or one the dialects disagree on. Only these may lend a
 * letter — a player who calls the picture something else gets a wrong letter.
 */
const PLAIN_SPELLING = /^[ابتثجحخدذرزسشصضطظعغفقكلمنهوي]+$/;
const DISPUTED = new Set([
  'كاب',
  'سطل',
  'ماوس',
  'كيبورد',
  'لابتوب',
  'جوال',
  'كرتون',
  'مفك',
  'شراب',
  'تلفون',
  'كشاف',
  'شال',
  'بوق',
  'قيتار',
  'باص',
  'سيكل',
  'دباب',
  'كاس',
  'فلامنغو',
  'غوريلا',
  'كوالا',
  'لاما',
  'بروكلي',
  'كرواسون',
  'دونات',
  'برجر',
  'مانجو',
  'ساندويتش',
  'تاكو',
  'وافل',
  'ترمومتر',
  'ساكسفون',
  'سكوتر',
  'هليكوبتر',
  'تراكتور',
  'باراشوت',
  'بولينج',
  'يويو',
  'تيشيرت',
  'تلسكوب',
  'تلفزيون',
  'كمبيوتر',
  'كاميرا',
  'راديو',
  'بيانو',
  'مايكروفون',
  'تاكسي',
  'كيوي',
  'بيتزا',
  'باندا',
  'كنغر',
  'دولفين',
  'ديناصور',
  'روبيان',
  'سلطعون',
  'حبار',
  'بطاطس',
  'طماطم',
  'قفازات',
  'دبدوب',
  'خروف',
  'كتب',
]);

export const letterThings = (): DrawnThing[] =>
  drawnThings().filter(
    (thing) => PLAIN_SPELLING.test(thing.ar) && !DISPUTED.has(thing.ar),
  );

/** Everyday words of three or four plain letters: what the pictures spell. */
export const LETTER_WORDS = [
  'جمل',
  'ملح',
  'برد',
  'قلم',
  'بحر',
  'جبل',
  'نهر',
  'شمس',
  'قمر',
  'ورد',
  'نجم',
  'بيت',
  'سوق',
  'باب',
  'حبل',
  'جسر',
  'قصر',
  'برج',
  'درب',
  'ثلج',
  'مطر',
  'رمل',
  'عسل',
  'تمر',
  'خبز',
  'لحم',
  'سمك',
  'بصل',
  'فجر',
  'ليل',
  'صيف',
  'ذهب',
  'خشب',
  'قطن',
  'صوف',
  'قلب',
  'شعر',
  'ظهر',
  'كتف',
  'نمر',
  'فيل',
  'ديك',
  'قرد',
  'كلب',
  'حوت',
  'نسر',
  'صقر',
  'عنب',
  'كرز',
  'ثوم',
  'جبن',
  'فطر',
  'تاج',
  'درع',
  'قفل',
  'طبل',
  'ظرف',
  'ترس',
  'جرس',
  'نار',
  'حرب',
  'سلم',
  'علم',
  'عمل',
  'حلم',
  'كرم',
  'شكر',
  'صبر',
  'فرح',
  'حزن',
  'ربيع',
  'خريف',
  'حديد',
  'زجاج',
  'حرير',
  'مكتب',
  'ملعب',
  'مطبخ',
  'مسجد',
  'مصنع',
  'مخزن',
  'مركب',
  'حصان',
  'غزال',
  'ثعلب',
  'كرسي',
  'سرير',
  'خاتم',
  'ميزان',
  'بركان',
  'كوكب',
  'قطار',
  'هلال',
  'صبار',
  'زيتون',
  'بطيخ',
  'خيار',
  'طريق',
  'صديق',
  'جدار',
  'سحاب',
  'تراب',
  'نخيل',
  'بستان',
  'ميدان',
  'فنجان',
  'دكان',
  'حمام',
  'سلام',
  'كلام',
  'طعام',
  'منام',
  'شراع',
  'ذراع',
  'صباح',
].filter((word) => word.length <= 4);

interface Lender {
  thing: DrawnThing;
  /** Which letter of its name is taken, counted from one. */
  position: number;
}

/**
 * A thing for every letter of the word, each lending the letter at the
 * position `positionOf` allows. Undefined when some letter has no lender.
 */
function lendersFor(
  word: string,
  positionsOf: (name: string) => number[],
  random: () => number,
  exclude: ReadonlySet<string> = new Set(),
): Lender[] | undefined {
  const used = new Set(exclude);
  const lenders: Lender[] = [];
  for (const letter of word) {
    const choices = shuffled(letterThings(), random).flatMap((thing) =>
      used.has(thing.key) || thing.ar === word
        ? []
        : positionsOf(thing.ar)
            .filter((position) => thing.ar[position - 1] === letter)
            .map((position) => ({ thing, position })),
    );
    if (choices.length === 0) return undefined;
    lenders.push(choices[0]);
    used.add(choices[0].thing.key);
  }
  return lenders;
}

/** Drawn right to left, as the word is read; `digits` go under the cards. */
export function lettersSvg(
  things: ReadonlyArray<DrawnThing>,
  marks: { ordered: boolean; digits?: number[] },
): string {
  const count = things.length;
  const card = Math.min(230, Math.floor((1080 - (count - 1) * 28) / count));
  const span = count * card + (count - 1) * 28;
  const y = (H - card) / 2 + (marks.ordered ? 22 : 0);
  let body = '';
  things.forEach((thing, index) => {
    const x = (W + span) / 2 - card - index * (card + 28);
    body +=
      `<g data-slot="${index}" data-thing="${thing.key}"${marks.digits ? ` data-take="${marks.digits[index]}"` : ''}>` +
      `<rect x="${round(x)}" y="${round(y)}" width="${card}" height="${card}" rx="30" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
      thingSvg(thing, x + card / 2, y + card / 2, round(card * 0.72)) +
      (marks.digits
        ? letterBadge(
            String(marks.digits[index]),
            x + card / 2,
            y + card + 58,
            38,
          )
        : '') +
      `</g>`;
  });
  if (marks.ordered) {
    // The order of reading: a line over the row with its head at the left.
    const right = (W + span) / 2 - 20;
    const left = (W - span) / 2 + 30;
    body +=
      `<g data-order="right-to-left"><line x1="${round(right)}" y1="${round(y - 52)}" x2="${round(left)}" y2="${round(y - 52)}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>` +
      `<polygon points="${round(left - 26)},${round(y - 52)} ${round(left + 6)},${round(y - 72)} ${round(left + 6)},${round(y - 32)}" fill="${INK}"/>` +
      `<circle cx="${round(right)}" cy="${round(y - 52)}" r="14" fill="${INK}"/></g>`;
  }
  return frame(body);
}

function composeInitials(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`picture-initials:${variantKey}:${seed}`);
  const shared = {
    familyKey: 'picture-initials',
    variantKey,
    concept:
      'Name each drawn thing, take one letter from each name, and read the word they make.',
  };

  const positionsOf =
    variantKey === 'last-letter'
      ? (name: string) => [name.length]
      : variantKey === 'cipher'
        ? (name: string) =>
            [2, 3, 4].filter((position) => position <= name.length)
        : () => [1];
  // Scrambled letters need four of them to be worth arranging.
  const words = shuffled(
    LETTER_WORDS.filter(
      (word) => variantKey !== 'scrambled' || word.length === 4,
    ),
    random,
  );
  for (const word of words) {
    const lenders = lendersFor(word, positionsOf, random);
    if (!lenders) continue;
    let row = lenders;
    if (variantKey === 'scrambled') {
      do {
        row = shuffled(lenders, random);
      } while (row.every((lender, index) => lender === lenders[index]));
    }
    return {
      ...shared,
      variant: `${variantKey}:${word}:${lenders.map((lender) => `${lender.thing.key}/${lender.position}`).join(',')}`,
      prompt:
        variantKey === 'last-letter'
          ? 'خذ آخر حرف من اسم كل رسمة، بالترتيب من اليمين. وش الكلمة؟'
          : variantKey === 'cipher'
            ? 'الرقم تحت كل رسمة يقول أي حرف تاخذ من اسمها. بالترتيب من اليمين، وش الكلمة؟'
            : 'خذ أول حرف من اسم كل رسمة ورتّب الحروف. وش الكلمة اللي تطلع؟',
      // Typed, not chosen (owner decision 2026-11-27): with options beside
      // it the word is found by matching letters. One spelling is right.
      options: [],
      correctOptionId: '',
      acceptedAnswers: [word],
      distractorRationale: [],
      altText: `${row.length} رسمات لأشياء معروفة في صف`,
      factualClaim: `Letters taken: ${lenders.map((lender) => `${lender.thing.ar}[${lender.position}]`).join(', ')} → «${word}».`,
      svg: lettersSvg(
        row.map((lender) => lender.thing),
        {
          ordered: variantKey !== 'scrambled',
          ...(variantKey === 'cipher'
            ? { digits: row.map((lender) => lender.position) }
            : {}),
        },
      ),
    };
  }
  throw new Error(
    `picture-initials: no word could be spelled for "${variantKey}"`,
  );
}

export function composeLetters(
  _familyKey: LettersFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  return composeInitials(seed, variantKey);
}
