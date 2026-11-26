import { createHash } from 'crypto';

/**
 * What every composed puzzle is drawn with: the page, the ink, a seeded
 * random source and the three-option answer shape. Shared by the modules
 * that draw the puzzle families, so that none of them imports another.
 */
export const PUZZLE_FONT_FAMILY = 'Noto Kufi Arabic';

export const W = 1200;
export const H = 675;
export const INK = '#1B1F3B';
export const PAPER = '#F6F1E7';
export const GOLD = '#E8B33A';
export const RED = '#D8493F';

/** Six colours a player can name at a glance, with the name of each. */
export const NAMED_COLOURS = [
  { key: 'red', name: 'الأحمر', colour: '#D8493F' },
  { key: 'blue', name: 'الأزرق', colour: '#2F6FE0' },
  { key: 'green', name: 'الأخضر', colour: '#2FA866' },
  { key: 'yellow', name: 'الأصفر', colour: '#F2C230' },
  { key: 'orange', name: 'البرتقالي', colour: '#F08A24' },
  { key: 'purple', name: 'البنفسجي', colour: '#8A4FD0' },
] as const;

export const LETTERS = ['أ', 'ب', 'ج', 'د'] as const;

export interface ComposedPuzzleDrawing {
  familyKey: string;
  /** The question asked of the drawing: one of the family's templates. */
  variantKey: string;
  /** The template plus what was drawn, for the reviewer and the tests. */
  variant: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
  /**
   * Set when the answer is typed, not chosen: every spelling that is right.
   * Such a puzzle has no options and no correct option.
   */
  acceptedAnswers?: string[];
  /** Why each wrong option is wrong, for the reviewer. */
  distractorRationale: Array<{ optionId: string; why: string }>;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

export const frame = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;

export const round = (value: number): number => Math.round(value * 10) / 10;

/** A small deterministic generator: the same seed, the same puzzle. */
export function seededRandom(seed: string): () => number {
  let counter = 0;
  let pool = Buffer.alloc(0);
  let offset = 0;
  return () => {
    if (offset + 4 > pool.length) {
      pool = createHash('sha256').update(`${seed}:${counter++}`).digest();
      offset = 0;
    }
    const value = pool.readUInt32BE(offset) / 0x100000000;
    offset += 4;
    return value;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length) % items.length];

/** Three options in a seeded order, ids a/b/c by position. */
export function asOptions(
  labels: readonly string[],
  correctLabel: string,
  random: () => number,
): { options: Array<{ id: string; label: string }>; correctOptionId: string } {
  const order = shuffled(labels, random);
  const options = order.map((label, index) => ({
    id: ['a', 'b', 'c', 'd'][index],
    label,
  }));
  return {
    options,
    correctOptionId: options.find((option) => option.label === correctLabel)!
      .id,
  };
}

/** A letter in a gold badge, to name a part of the picture. */
export const letterBadge = (
  letter: string,
  cx: number,
  cy: number,
  r = 30,
): string =>
  `<circle cx="${round(cx)}" cy="${round(cy)}" r="${r}" fill="${GOLD}" stroke="${INK}" stroke-width="7"/>` +
  `<text x="${round(cx)}" y="${round(cy + r * 0.38)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${round(r * 1.15)}" fill="${INK}">${letter}</text>`;

/** One reason given to every wrong option. */
export const sameReason = (
  options: Array<{ id: string }>,
  correctOptionId: string,
  why: string | ((optionId: string) => string),
): Array<{ optionId: string; why: string }> =>
  options
    .filter((option) => option.id !== correctOptionId)
    .map((option) => ({
      optionId: option.id,
      why: typeof why === 'string' ? why : why(option.id),
    }));

/** A whole number against three near it, as words or digits. */
export function countOptions(
  answer: number,
  random: () => number,
  label: (value: number) => string = String,
  minimum = 1,
  maximum = Number.POSITIVE_INFINITY,
): { options: Array<{ id: string; label: string }>; correctOptionId: string } {
  const near = shuffled(
    [answer - 1, answer + 1, answer + 2, answer - 2, answer + 3, answer - 3],
    random,
  )
    .filter((value) => value >= minimum && value <= maximum)
    .sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer))
    .slice(0, 3);
  return asOptions([answer, ...near].map(label), label(answer), random);
}
