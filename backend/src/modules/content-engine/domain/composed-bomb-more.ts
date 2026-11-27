import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  INK,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  H,
  frame,
  pick,
  round,
  shuffled,
} from './composed-kit';
import {
  DrawnThing,
  bombNames,
  findDrawnThingsDirectory,
  thingSilhouetteSvg,
  thingSvg,
} from './drawn-things';

/**
 * More القنبلة templates: three for اكتشف الخطأ (the wrong name, the wrong
 * shadow, the wrong sum) and three for الحروف والكلمات (same first letter,
 * same last letter, a sentence without its dots). Each answer is a name or a
 * number typed, never one of four.
 */
export interface MoreBomb {
  variant: string;
  prompt: string;
  answers?: string[];
  answerNumber?: number;
  answerKey?: string;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

const text = (value: string, x: number, y: number, size: number, fill = INK) =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

const card = (thing: DrawnThing, cx: number, cy: number, size: number) =>
  `<g data-thing="${thing.key}"><rect x="${round(cx - size / 2)}" y="${round(cy - size / 2)}" width="${size}" height="${size}" rx="24" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>` +
  thingSvg(thing, cx, cy, round(size * 0.72)) +
  `</g>`;

/** A name as the game compares it. */
export const foldName = (name: string): string =>
  name
    .replace(/^ال/, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

const names = (thing: DrawnThing) => bombNames().get(thing.key) ?? [thing.ar];
const shownName = (thing: DrawnThing) => names(thing)[0];

// ---------------------------------------------------------------------------
// اكتشف الخطأ
// ---------------------------------------------------------------------------

export function mislabeled(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): MoreBomb {
  const folded = new Set(names(answer).map(foldName));
  const others = shuffled(
    pool.filter(
      (thing) =>
        thing.key !== answer.key &&
        !names(thing).some((name) => folded.has(foldName(name))),
    ),
    random,
  );
  const [a, b, c, wrong] = others;
  const k = Math.floor(random() * 4);
  const row = [a, b, c];
  row.splice(k, 0, answer);
  let body = '';
  row.forEach((thing, i) => {
    const cx = W / 2 + (1.5 - i) * 260;
    body +=
      card(thing, cx, 280, 210) +
      text(i === k ? shownName(wrong) : shownName(thing), cx, 470, 40);
  });
  return {
    variant: `mislabeled:${answer.key}:${wrong.key}`,
    prompt: 'اسم وحدة من الرسمات غلط. وش اسمها الصحيح؟',
    answers: names(answer),
    answerKey: answer.key,
    altText: 'أربع رسمات تحت كل وحدة اسم، واسم واحد غلط',
    concept: 'Find the drawing named wrongly and give its right name.',
    factualClaim: `«${answer.ar}» is labelled «${shownName(wrong)}».`,
    svg: frame(body),
  };
}

export function wrongShadow(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): MoreBomb {
  // Shapes nobody could take for another: the swapped shadow must be plainly
  // not the drawing's own.
  const clear = (thing: DrawnThing) => thing.twins.length <= 1;
  const others = shuffled(
    pool.filter(
      (thing) =>
        thing.key !== answer.key &&
        clear(thing) &&
        !thing.twins.includes(answer.key) &&
        !answer.twins.includes(thing.key),
    ),
    random,
  );
  const [a, b, c, swapped] = others;
  const k = Math.floor(random() * 4);
  const row = [a, b, c];
  row.splice(k, 0, answer);
  let body = '';
  row.forEach((thing, i) => {
    const cx = W / 2 + (1.5 - i) * 260;
    body +=
      card(thing, cx, 190, 180) +
      `<path d="M ${cx} 292 l 0 46 m -12 -14 l 12 14 l 12 -14" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<rect x="${cx - 90}" y="350" width="180" height="180" rx="24" fill="#E7DFD0" stroke="${INK}" stroke-width="5"/>` +
      `<g data-shadow="${i === k ? swapped.key : thing.key}">${thingSilhouetteSvg(i === k ? swapped : thing, cx, 440, 130, INK)}</g>`;
  });
  return {
    variant: `wrong-shadow:${answer.key}:${swapped.key}`,
    prompt: 'كل رسمة تحتها ظلها، إلا وحدة ظلها غلط. وش هي؟',
    answers: names(answer),
    answerKey: answer.key,
    altText: 'أربع رسمات وتحت كل وحدة ظل، وظل واحد لشي ثاني',
    concept:
      'Match each drawing to its shadow and name the one whose shadow is not its own.',
    factualClaim: `«${answer.ar}» stands over the shadow of «${swapped.ar}».`,
    svg: frame(body),
  };
}

export function wrongSum(random: () => number): MoreBomb {
  for (;;) {
    const sums = Array.from({ length: 4 }, () => {
      const op = pick(['+', '−', '×'], random);
      let x = 2 + Math.floor(random() * 12);
      let y = 2 + Math.floor(random() * 9);
      if (op === '−' && y > x) [x, y] = [y, x];
      if (op === '×') x = 2 + Math.floor(random() * 8);
      const value = op === '+' ? x + y : op === '−' ? x - y : x * y;
      return { x, y, op, value, shown: value };
    });
    const k = Math.floor(random() * 4);
    sums[k].shown = sums[k].value + pick([-2, -1, 1, 2, 10, -10], random);
    if (sums[k].shown < 0 || sums[k].value < 2) continue;
    let body = '';
    sums.forEach((sum, i) => {
      const cy = 110 + i * 130;
      // The sign is drawn: «−» and «×» are not in the composer font.
      const sign =
        sum.op === '+'
          ? `<path d="M -16 0 h 32 M 0 -16 v 32" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
          : sum.op === '−'
            ? `<path d="M -16 0 h 32" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
            : `<path d="M -13 -13 l 26 26 M 13 -13 l -26 26" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
      body +=
        `<g data-sum="${i}" data-right="${sum.value}" data-shown="${sum.shown}"><rect x="${W / 2 - 260}" y="${cy - 50}" width="520" height="100" rx="20" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
        text(String(sum.x), W / 2 - 170, cy + 22, 56) +
        `<g transform="translate(${W / 2 - 95} ${cy})">${sign}</g>` +
        text(String(sum.y), W / 2 - 20, cy + 22, 56) +
        `<path d="M ${W / 2 + 50} ${cy - 9} h 34 M ${W / 2 + 50} ${cy + 9} h 34" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
        text(String(sum.shown), W / 2 + 165, cy + 22, 56) +
        `</g>`;
    });
    return {
      variant: `wrong-sum:${sums.map((s) => `${s.x}${s.op}${s.y}=${s.shown}`).join(',')}`,
      prompt: 'وحدة من العمليات غلط. وش ناتجها الصحيح؟',
      answerNumber: sums[k].value,
      altText: 'أربع عمليات حسابية، وحدة منها غلط',
      concept: 'Check four sums and give the right result of the wrong one.',
      factualClaim: `${sums[k].x} ${sums[k].op} ${sums[k].y} is ${sums[k].value}, not ${sums[k].shown}.`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// الحروف والكلمات
// ---------------------------------------------------------------------------

/** Drawings whose names all read the same: their letters can be counted on. */
export const oneNameThings = (pool: readonly DrawnThing[]) =>
  pool.filter((thing) => new Set(names(thing).map(foldName)).size === 1);

export function sameLetter(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  last: boolean,
  random: () => number,
): MoreBomb | undefined {
  const at = (thing: DrawnThing) => {
    const name = foldName(shownName(thing)).replace(/\s/g, '');
    return last ? name[name.length - 1] : name[0];
  };
  const groups = new Map<string, DrawnThing[]>();
  for (const thing of oneNameThings(pool)) {
    if (thing.key === answer.key) continue;
    groups.set(at(thing), [...(groups.get(at(thing)) ?? []), thing]);
  }
  // Not a letter any of the answer's own names would share.
  const own = new Set(
    names(answer).map((name) => {
      const n = foldName(name).replace(/\s/g, '');
      return last ? n[n.length - 1] : n[0];
    }),
  );
  const letters = [...groups.keys()].filter(
    (letter) => !own.has(letter) && groups.get(letter)!.length >= 3,
  );
  if (!letters.length) return undefined;
  const letter = pick(letters, random);
  const three = shuffled(groups.get(letter)!, random).slice(0, 3);
  const row = shuffled([...three, answer], random);
  let body = '';
  row.forEach((thing, i) => {
    body += card(thing, W / 2 + (1.5 - i) * 260, H / 2, 220);
  });
  return {
    variant: `${last ? 'same-last' : 'same-first'}:${letter}:${answer.key}`,
    prompt: last
      ? 'ثلاث أسماء تنتهي بنفس الحرف. وش الرابعة؟'
      : 'ثلاث أسماء تبدأ بنفس الحرف. وش الرابعة؟',
    answers: names(answer),
    answerKey: answer.key,
    altText: 'أربع رسمات، ثلاث منها أسماؤها تشترك في حرف',
    concept: `Name the drawing whose name does not ${last ? 'end' : 'begin'} with the letter the other three share.`,
    factualClaim: `${three.map((t) => t.ar).join(', ')} ${last ? 'end' : 'begin'} with «${letter}»; «${answer.ar}» does not.`,
    svg: frame(body),
  };
}

/** A word as it is written with its dots taken away. */
export function withoutDots(word: string): string {
  return [...word]
    .map((c, i, all) => {
      const last = i === all.length - 1;
      if ('بتثني'.includes(c)) {
        return last ? (c === 'ن' ? 'ں' : c === 'ي' ? 'ى' : 'ٮ') : 'ٮ';
      }
      if (c === 'ئ') return last ? 'ى' : 'ٮ';
      if (c === 'ف') return 'ڡ';
      if (c === 'ق') return last ? 'ٯ' : 'ڡ';
      if (c === 'ج' || c === 'خ') return 'ح';
      const plain: Record<string, string> = {
        ذ: 'د',
        ز: 'ر',
        ش: 'س',
        ض: 'ص',
        ظ: 'ط',
        غ: 'ع',
        ة: 'ه',
        أ: 'ا',
        إ: 'ا',
        آ: 'ا',
        ؤ: 'و',
      };
      return plain[c] ?? c;
    })
    .join('');
}

let sentences: string[] | undefined;

/** The reviewed sentences, the asked word in [brackets]. */
export function dotlessSentences(): string[] {
  if (sentences) return sentences;
  try {
    const directory = findDrawnThingsDirectory();
    const file = directory ? join(directory, 'dotless-sentences.txt') : '';
    sentences =
      file && existsSync(file)
        ? readFileSync(file, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .filter(
              (line) =>
                line && !line.startsWith('#') && /\[[^\]]+\]/.test(line),
            )
        : [];
  } catch {
    sentences = [];
  }
  return sentences;
}

export function dotlessSentence(sentence: string): MoreBomb {
  const target = /\[([^\]]+)\]/.exec(sentence)![1];
  const words = sentence.split(/\s+/);
  const chip = (word: string) => [...withoutDots(word)].length * 38 + 48;
  const rows: string[][] = [[]];
  let used = 0;
  for (const word of words) {
    const width = chip(word.replace(/[[\]]/g, '')) + 18;
    if (used + width > 1060 && rows[rows.length - 1].length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push(word);
    used += width;
  }
  let body = '';
  const top = H / 2 - (rows.length * 130) / 2;
  rows.forEach((row, r) => {
    const widths = row.map((word) => chip(word.replace(/[[\]]/g, '')));
    const total = widths.reduce((a, b) => a + b, 0) + 18 * (row.length - 1);
    let x = W / 2 + total / 2;
    row.forEach((word, k) => {
      const asked = word.startsWith('[');
      const clean = word.replace(/[[\]]/g, '');
      const left = x - widths[k];
      const y = top + r * 130;
      body +=
        `<g data-word="${k}"${asked ? ' data-asked="1"' : ''}><rect x="${round(left)}" y="${round(y)}" width="${widths[k]}" height="104" rx="18" fill="#FFFFFF" stroke="${asked ? RED : INK}" stroke-width="${asked ? 9 : 5}"/>` +
        text(withoutDots(clean), left + widths[k] / 2, y + 72, 58) +
        (asked
          ? `<line x1="${round(left + 14)}" y1="${round(y + 122)}" x2="${round(left + widths[k] - 14)}" y2="${round(y + 122)}" stroke="${RED}" stroke-width="10" stroke-linecap="round"/>`
          : '') +
        `</g>`;
      x = left - 18;
    });
  });
  return {
    variant: `dotless:${target}`,
    prompt: 'جملة انمسحت نقاطها. وش الكلمة اللي تحتها خط؟',
    answers: [target],
    answerKey: `dotless-${target}`,
    altText: 'جملة مكتوبة بدون نقاط، وكلمة منها محاطة بالأحمر',
    concept:
      'Read a sentence written without its dots and give the marked word.',
    factualClaim: `«${sentence.replace(/[[\]]/g, '')}»: the marked word is «${target}».`,
    svg: frame(body),
  };
}
