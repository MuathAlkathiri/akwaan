import {
  ComposedPuzzleDrawing,
  H,
  INK,
  PUZZLE_FONT_FAMILY,
  W,
  asOptions,
  frame,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';

/**
 * «ووردل» — the guess row is drawn the way the game draws it: a tile for each
 * letter, coloured, with the key of the three colours under it. The engine
 * picks the secret word, colours the guess itself and proves that exactly one
 * of the four options fits; a model colouring letters by hand got it wrong
 * and wrote prompts nobody could read.
 */
export const WORDLE_VARIANTS = {
  'wordle-single-guess': ['three-letters', 'four-letters', 'two-guesses'],
} as const;

export type WordleFamily = keyof typeof WORDLE_VARIANTS;

export type TileColour = 'green' | 'yellow' | 'grey';

const TILE: Record<TileColour, string> = {
  green: '#2FA866',
  yellow: '#F2C230',
  grey: '#C9CCD6',
};

const PLAIN = /^[ابتثجحخدذرزسشصضطظعغفقكلمنهوي]+$/;

/** Everyday words; only those of plain, different letters are played. */
const WORDS = `
بحر قمر نجم شمس جبل نهر ورد شجر حجر رمل ملح سكر خبز لحم سمك تمر عنب موز توت
بصل ثوم فجل جزر عسل لبن جبن زيت قلم بيت درج سقف حبل سيف رمح قوس سهم درع تاج
عرش قصر برج جسر سوق نمر فهد قرد فيل جمل خيل بقر غنم كلب صقر نسر بوم ديك نحل
نمل حوت قرش ثلج مطر برق رعد ريح غيم نور نار ذهب حلم نوم صبر فرح حزن خوف حرب
سلم ربح وقت يوم شهر عمر صبح ظهر عصر فجر وجه عين قلب كبد صدر بطن قدم شعر جلد
عظم ثوب خيط صوف قطن لون رسم بنت ولد رجل طفل ملك جيش علم درس فصل حرف رقم لعب
هدف فوز حكم مال بنك سعر طبخ قدر صحن كوب شاي فرن غاز خشب حطب فحم طين صخر كهف
وطن بلد حقل زرع قمح تبن ريش جرس طبل عود لحن فلم خبر سفر درب ركن
كتاب دفتر مكتب كرسي مطبخ شباك جدار قميص خاتم مسجد ملعب مصنع متجر مخبز مطار
شارع طريق رصيف جبال بحار نجوم قلوب عيون بيوت سيوف طيور نمور فهود قرود جمال
خيول كلاب حصان غزال خروف غراب صقور نسور تمور تفاح خيار رمان بطيخ حليب لحوم
طعام شراب فطور صباح نهار ربيع خريف سحاب رياح ثلوج صديق ضيوف طالب كاتب شاعر
رسام نجار خباز طيار جندي ملوك وزير قاضي تاجر فلاح صياد راعي هاتف حاسب درهم
ريال نقود فريق لاعب مدرب سباق قصير طويل كبير صغير جميل قديم سريع قريب بعيد
سعيد حزين غريب عجيب نظيف ثقيل عميق واسع سلاح قطار جهاز بريد ميدان صندوق
منزل مصعد ملعق مفرش مركب قارب شراع جزير ساحل موجه رمال صخور كهوف وادي سهول
`
  .split(/\s+/)
  .filter(
    (word) =>
      (word.length === 3 || word.length === 4) &&
      PLAIN.test(word) &&
      new Set(word).size === word.length,
  );

export const WORDLE_WORDS: readonly string[] = [...new Set(WORDS)].filter(
  (word) => !['ملعق', 'جزير', 'موجه'].includes(word),
);

/** The colours a guess earns against a word. Letters never repeat here. */
export function colourGuess(guess: string, word: string): TileColour[] {
  return [...guess].map((letter, index) =>
    word[index] === letter
      ? 'green'
      : word.includes(letter)
        ? 'yellow'
        : 'grey',
  );
}

/** The tiles a word breaks: where it would have coloured the guess otherwise. */
export function brokenTiles(
  guess: string,
  colours: readonly TileColour[],
  word: string,
): number[] {
  const own = colourGuess(guess, word);
  return own.flatMap((colour, index) =>
    colour === colours[index] ? [] : [index],
  );
}

const COLOUR_NAME: Record<TileColour, string> = {
  green: 'أخضر',
  yellow: 'أصفر',
  grey: 'رمادي',
};

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  anchor = 'middle',
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${INK}">${value}</text>`;

export function wordleSvg(
  rows: ReadonlyArray<{ guess: string; colours: readonly TileColour[] }>,
): string {
  const length = rows[0].guess.length;
  const tile = rows.length === 1 ? 170 : 132;
  const gap = 22;
  const span = length * tile + (length - 1) * gap;
  const block = rows.length * tile + (rows.length - 1) * gap;
  const top = (H - 150 - block) / 2 + 14;
  let body = '';
  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * (tile + gap);
    [...row.guess].forEach((letter, index) => {
      // Arabic reads from the right: the first letter is the rightmost tile.
      const x = (W + span) / 2 - tile - index * (tile + gap);
      body +=
        `<g data-row="${rowIndex}" data-tile="${index}" data-letter="${letter}" data-colour="${row.colours[index]}">` +
        `<rect x="${round(x)}" y="${round(y)}" width="${tile}" height="${tile}" rx="24" fill="${TILE[row.colours[index]]}" stroke="${INK}" stroke-width="9"/>` +
        text(letter, x + tile / 2, y + tile * 0.66, round(tile * 0.52)) +
        `</g>`;
    });
  });
  // The key: what each colour says, in the words of the game.
  const key: Array<[TileColour, string]> = [
    ['green', 'في مكانه'],
    ['yellow', 'موجود ومكانه غلط'],
    ['grey', 'مو موجود'],
  ];
  const widths = [250, 400, 250];
  const total = widths.reduce((sum, width) => sum + width, 0);
  let right = (W + total) / 2;
  const keyY = H - 104;
  key.forEach(([colour, label], index) => {
    body +=
      `<g data-key="${colour}"><rect x="${round(right - 56)}" y="${keyY}" width="56" height="56" rx="12" fill="${TILE[colour]}" stroke="${INK}" stroke-width="6"/>` +
      text(label, right - 72, keyY + 40, 32, 'end') +
      `</g>`;
    right -= widths[index];
  });
  return frame(body);
}

interface Round {
  word: string;
  rows: Array<{ guess: string; colours: TileColour[] }>;
  wrong: Array<{ word: string; why: string }>;
}

const describeBreak = (
  guess: string,
  colours: readonly TileColour[],
  word: string,
): string => {
  const index = brokenTiles(guess, colours, word)[0];
  const letter = guess[index];
  const colour = colours[index];
  return colour === 'green'
    ? `«${letter}» أخضر في مكانه، و«${word}» ما فيها «${letter}» في هذا المكان.`
    : colour === 'yellow'
      ? word.includes(letter)
        ? `«${letter}» أصفر يعني مكانه غلط، و«${word}» فيها «${letter}» في نفس المكان.`
        : `«${letter}» أصفر يعني موجود، و«${word}» ما فيها «${letter}».`
      : `«${letter}» ${COLOUR_NAME.grey} يعني مو موجود، و«${word}» فيها «${letter}».`;
};

function buildRound(
  length: number,
  guesses: number,
  random: () => number,
): Round | undefined {
  const pool = WORDLE_WORDS.filter((word) => word.length === length);
  for (const word of shuffled(pool, random)) {
    const candidates = shuffled(
      pool.filter((guess) => {
        if (guess === word) return false;
        const colours = colourGuess(guess, word);
        const lit = colours.filter((colour) => colour !== 'grey').length;
        // A row that says enough to work with, and does not hand the word over.
        return lit >= (guesses === 1 ? 2 : 1) && lit < length;
      }),
      random,
    );
    if (candidates.length < guesses) continue;
    const rows = candidates.slice(0, guesses).map((guess) => ({
      guess,
      colours: colourGuess(guess, word),
    }));
    if (
      guesses === 2 &&
      rows.reduce(
        (sum, row) =>
          sum + row.colours.filter((colour) => colour !== 'grey').length,
        0,
      ) < 3
    ) {
      continue;
    }
    const shown = new Set(rows.map((row) => row.guess));
    const scored = shuffled(pool, random)
      .filter((other) => other !== word && !shown.has(other))
      .map((other) => {
        const breaks = rows.map((row) =>
          brokenTiles(row.guess, row.colours, other),
        );
        const row = breaks.findIndex((tiles) => tiles.length > 0);
        return {
          other,
          total: breaks.reduce((sum, tiles) => sum + tiles.length, 0),
          passesARow: breaks.some((tiles) => tiles.length === 0),
          tile: row < 0 ? '' : `${row}:${breaks[row][0]}`,
        };
      })
      // The closest wrong words: one tile against them, or, with two rows,
      // a whole row in their favour.
      .filter((entry) =>
        guesses === 1
          ? entry.total === 1
          : entry.passesARow && entry.total > 0 && entry.total <= 2,
      );
    // Each wrong word falls to a different tile where it can, so no single
    // tile settles the question.
    const chosen: typeof scored = [];
    for (const entry of scored) {
      if (chosen.length < 3 && !chosen.some((c) => c.tile === entry.tile)) {
        chosen.push(entry);
      }
    }
    if (chosen.length < 2) continue;
    for (const entry of scored) {
      if (chosen.length < 3 && !chosen.includes(entry)) chosen.push(entry);
    }
    if (chosen.length < 3) continue;
    return {
      word,
      rows,
      wrong: chosen.map((entry) => {
        const row = rows.find(
          (candidate) =>
            brokenTiles(candidate.guess, candidate.colours, entry.other)
              .length > 0,
        )!;
        return {
          word: entry.other,
          why: describeBreak(row.guess, row.colours, entry.other),
        };
      }),
    };
  }
  return undefined;
}

export function composeWordle(
  _familyKey: WordleFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`wordle-single-guess:${variantKey}:${seed}`);
  const guesses = variantKey === 'two-guesses' ? 2 : 1;
  const length = variantKey === 'three-letters' ? 3 : 4;
  const round_ = buildRound(length, guesses, random);
  if (!round_) {
    throw new Error(`wordle-single-guess: no round for "${variantKey}"`);
  }
  const { options, correctOptionId } = asOptions(
    [round_.word, ...round_.wrong.map((entry) => entry.word)],
    round_.word,
    random,
  );
  return {
    familyKey: 'wordle-single-guess',
    variantKey,
    variant: `${variantKey}:${round_.word}:${round_.rows.map((row) => row.guess).join(',')}`,
    concept:
      'Read what each coloured tile says about the hidden word and keep the one option that agrees with every tile.',
    prompt:
      guesses === 2
        ? 'تخمينتين لكلمة مخفية، ولون كل حرف يقول لك عنه. أي كلمة هي المخفية؟'
        : 'هذي تخمينة لكلمة مخفية، ولون كل حرف يقول لك عنه. أي كلمة هي المخفية؟',
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why: round_.wrong.find((entry) => entry.word === option.label)!.why,
      })),
    altText:
      guesses === 2
        ? 'تخمينتين من حروف ملونة ومفتاح الألوان تحتها'
        : 'تخمينة من حروف ملونة ومفتاح الألوان تحتها',
    factualClaim: `Hidden word «${round_.word}»; ${round_.rows.map((row) => `«${row.guess}» → ${row.colours.join('/')}`).join('; ')}.`,
    svg: wordleSvg(round_.rows),
  };
}
