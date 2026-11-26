import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';
import {
  TileColour,
  WORDLE_VARIANTS,
  WORDLE_WORDS,
  brokenTiles,
  colourGuess,
  composeWordle,
} from './composed-wordle';

const seeds = Array.from({ length: 120 }, (_, index) => `job:${index}`);

/** The rows as drawn: each guess with the colour of every tile. */
const rowsOf = (svg: string) => {
  const rows: Array<{ guess: string; colours: TileColour[] }> = [];
  for (const match of svg.matchAll(
    /data-row="(\d)" data-tile="\d" data-letter="(.)" data-colour="(\w+)"/g,
  )) {
    const row = (rows[Number(match[1])] ??= { guess: '', colours: [] });
    row.guess += match[2];
    row.colours.push(match[3] as TileColour);
  }
  return rows;
};

describe('«ووردل», drawn', () => {
  it('is drawn through the one composer', () => {
    expect(COMPOSED_PUZZLE_VARIANTS['wordle-single-guess']).toEqual(
      WORDLE_VARIANTS['wordle-single-guess'],
    );
    expect(composePuzzle('wordle-single-guess', 'job:1').familyKey).toBe(
      'wordle-single-guess',
    );
  });

  it('plays only words of plain, different letters', () => {
    expect(WORDLE_WORDS.length).toBeGreaterThan(200);
    for (const word of WORDLE_WORDS) {
      expect(new Set(word).size).toBe(word.length);
    }
  });

  it('colours a guess the way the game does', () => {
    expect(colourGuess('حبل', 'لبن')).toEqual(['grey', 'green', 'yellow']);
    expect(brokenTiles('حبل', ['grey', 'green', 'yellow'], 'كلب')).toEqual([1]);
  });

  it.each(WORDLE_VARIANTS['wordle-single-guess'])(
    '%s: one option agrees with every tile, and only one',
    (variantKey) => {
      for (const seed of seeds) {
        const item = composeWordle('wordle-single-guess', seed, variantKey);
        const rows = rowsOf(item.svg);
        expect(rows).toHaveLength(variantKey === 'two-guesses' ? 2 : 1);
        expect(rows[0].guess).toHaveLength(
          variantKey === 'three-letters' ? 3 : 4,
        );
        expect(item.options).toHaveLength(4);
        expect(new Set(item.options.map((option) => option.label)).size).toBe(
          4,
        );
        const fitting = item.options.filter((option) =>
          rows.every(
            (row) =>
              brokenTiles(row.guess, row.colours, option.label).length === 0,
          ),
        );
        expect(fitting.map((option) => option.id)).toEqual([
          item.correctOptionId,
        ]);
        // No guess is itself offered, and every wrong option has its reason.
        for (const row of rows) {
          expect(item.options.map((option) => option.label)).not.toContain(
            row.guess,
          );
        }
        expect(item.distractorRationale).toHaveLength(3);
      }
    },
  );

  it('one tile never settles a single guess: the wrong words fall to different tiles', () => {
    for (const seed of seeds) {
      const item = composeWordle('wordle-single-guess', seed, 'four-letters');
      const [row] = rowsOf(item.svg);
      const tiles = item.options
        .filter((option) => option.id !== item.correctOptionId)
        .map((option) => brokenTiles(row.guess, row.colours, option.label));
      for (const broken of tiles) expect(broken).toHaveLength(1);
      expect(new Set(tiles.map(([tile]) => tile)).size).toBeGreaterThan(1);
    }
  });
});
