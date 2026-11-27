import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * The library of drawn everyday things — an animal, a fruit, a tool — that
 * the composer places in its pictures.
 *
 * The drawings are Fluent Emoji (flat), MIT-licensed; which of them are in
 * the library, and what each is called in Arabic, is `catalog.txt` beside
 * them. `backend/scripts/import-drawn-things.mjs` rebuilds `things.json`
 * from the two.
 */
export const DRAWN_THING_CATEGORIES = [
  'animal',
  'food',
  'object',
  'vehicle',
  'play',
  'nature',
  'place',
] as const;

export type DrawnThingCategory = (typeof DRAWN_THING_CATEGORIES)[number];

export interface DrawnThing {
  key: string;
  /** Its name as an answer is read: «قطة». */
  ar: string;
  /** Its name inside a sentence: «القطة». */
  the: string;
  category: DrawnThingCategory;
  /** The drawing itself: SVG markup on a 32-unit square. */
  body: string;
  /**
   * Other drawings whose shadow is nearly the same as this one's (three
   * balls, a kiwi and an olive). Worked out when the library is built.
   */
  twins: string[];
}

const LIBRARY_FILE = 'things.json';

export function findDrawnThingsDirectory(start = __dirname): string | null {
  let directory = start;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(directory, 'assets', 'drawn-things');
    if (existsSync(join(candidate, LIBRARY_FILE))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

let library: readonly DrawnThing[] | undefined;

/**
 * Every drawing in the library; empty when the library is not on this host.
 * It never throws: a composer without the library still draws its plain
 * pictures.
 */
export function drawnThings(): readonly DrawnThing[] {
  if (library) return library;
  try {
    const directory = findDrawnThingsDirectory();
    const parsed = directory
      ? (JSON.parse(readFileSync(join(directory, LIBRARY_FILE), 'utf8')) as {
          things: DrawnThing[];
        })
      : { things: [] };
    library = parsed.things;
  } catch {
    library = [];
  }
  return library;
}

export const drawnThingsOf = (
  category: DrawnThingCategory,
): readonly DrawnThing[] =>
  drawnThings().filter((thing) => thing.category === category);

/** «القطة» → «للقطة»; «شنطة الظهر» → «لشنطة الظهر». */
export const toThe = (the: string): string =>
  the.startsWith('ال') ? `لل${the.slice(2)}` : `ل${the}`;

/** The drawing, `size` across, centred on a point. */
export function thingSvg(
  thing: Pick<DrawnThing, 'body'>,
  cx: number,
  cy: number,
  size: number,
): string {
  const corner = (value: number) => Math.round((value - size / 2) * 10) / 10;
  return `<svg x="${corner(cx)}" y="${corner(cy)}" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">${thing.body}</svg>`;
}

/**
 * The same drawing as a shadow: every part filled with one colour, so only
 * its outline is left to recognise it by.
 */
export function thingSilhouetteSvg(
  thing: Pick<DrawnThing, 'body'>,
  cx: number,
  cy: number,
  size: number,
  colour: string,
): string {
  return thingSvg(
    {
      body: thing.body
        .replace(/fill="(?!none)[^"]*"/g, `fill="${colour}"`)
        .replace(/stroke="(?!none)[^"]*"/g, `stroke="${colour}"`)
        .replace(/ opacity="[^"]*"/g, ''),
    },
    cx,
    cy,
    size,
  );
}

let names: ReadonlyMap<string, string[]> | undefined;

/**
 * Every name a player may type for each drawing asked by name
 * (`bomb-names.txt`, reviewed by the owner). A drawing with one name, or
 * whose names all agree on a letter, can lend that letter safely.
 */
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
