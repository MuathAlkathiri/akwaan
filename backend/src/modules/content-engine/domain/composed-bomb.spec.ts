import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  BOMB_VARIANTS,
  bombNames,
  composeBomb,
  namedThings,
  numberAnswers,
} from './composed-bomb';
import { drawnThings } from './drawn-things';
import {
  PATH_BOMB_VARIANTS,
  SLOW_PATH_BOMB_VARIANTS,
  dropBall,
  runRobot,
  walkArrows,
} from './composed-bomb-paths';
import {
  NUMBER_BOMB_VARIANTS,
  SLOW_NUMBER_BOMB_VARIANTS,
  completions,
  composeNumberBomb,
  fewestCoins,
  machineAnswers,
  sequenceAnswers,
} from './composed-bomb-numbers';

const seeds = Array.from({ length: 40 }, (_, index) => `job:${index}`);
const all = Object.entries(BOMB_VARIANTS).flatMap(([family, variants]) =>
  (variants as readonly string[]).map(
    (variant) => [family, variant] as [never, string],
  ),
);

describe('القنبلة in عالم الألغاز, drawn by the engine', () => {
  it('asks by name only drawings with a reviewed list of names', () => {
    const keys = new Set(drawnThings().map((thing) => thing.key));
    expect(bombNames().size).toBeGreaterThan(120);
    for (const [key, forms] of bombNames()) {
      expect(keys.has(key)).toBe(true);
      expect(forms.length).toBeGreaterThan(0);
      expect(forms.length).toBeLessThanOrEqual(10);
    }
    expect(namedThings().length).toBe(bombNames().size);
  });

  it('takes a number in Western digits, Arabic digits and words', () => {
    expect(numberAnswers(7)).toEqual(['7', '٧', 'سبعة']);
    expect(numberAnswers(12)).toContain('اثنعش');
  });

  it.each(all)(
    '%s / %s: a short question with typed answers it does not give away',
    (family, variant) => {
      for (const seed of seeds) {
        const item = composeBomb(family, seed, variant);
        expect(item.variantKey).toBe(variant);
        expect([...item.prompt].length).toBeLessThan(70);
        expect(item.acceptedAnswers.length).toBeGreaterThan(0);
        // The game refuses two answers it folds into one (فأر, فار).
        const folded = item.acceptedAnswers.map((answer) =>
          normalizeAnswer(answer),
        );
        expect(new Set(folded).size).toBe(folded.length);
        for (const answer of item.acceptedAnswers) {
          expect(answer.trim()).toBe(answer);
          if (answer.length > 2) expect(item.prompt).not.toContain(answer);
        }
        expect(composeBomb(family, seed, variant)).toEqual(item);
      }
    },
  );

  it('the thread asked about ends at the thing whose name is the answer', () => {
    for (const seed of seeds) {
      const item = composeBomb('bomb-thread-end', seed);
      const [, named] = /«(.+)»/.exec(item.factualClaim)!;
      expect(item.acceptedAnswers).toContain(named);
    }
  });
});

describe('ألغاز الأرقام — القنبلة in الأرقام والتقدير', () => {
  it('keeps the slow templates to about a third', () => {
    expect(
      SLOW_NUMBER_BOMB_VARIANTS.length / NUMBER_BOMB_VARIANTS.length,
    ).toBeLessThanOrEqual(0.4);
  });

  it('refuses a puzzle with a second reasonable reading', () => {
    expect(sequenceAnswers([3, 8, 6, 11, 9])).toEqual([14]);
    // Two examples fit more than one rule; three settle it.
    expect(
      machineAnswers(
        [
          [1, 2],
          [2, 5],
        ],
        3,
      ).length,
    ).toBeGreaterThan(1);
    expect(
      machineAnswers(
        [
          [2, 5],
          [4, 9],
          [5, 11],
        ],
        6,
      ),
    ).toEqual([13]);
    expect(fewestCoins([1, 3, 4], 6)).toBe(2);
  });

  it.each(NUMBER_BOMB_VARIANTS.map((v) => [v]))(
    '%s: the answer is the one the drawing proves',
    (variant) => {
      for (const seed of seeds) {
        const item = composeNumberBomb(seed, variant);
        expect(Number.isInteger(item.answer)).toBe(true);
        expect(item.answer).toBeGreaterThanOrEqual(0);
        if (variant === 'number-grid') {
          const grid = item.variant
            .split(':')[1]
            .split('/')
            .map((row) => [...row].map((v) => (v === '.' ? null : Number(v))));
          expect(completions(grid)).toBe(1);
        }
        if (variant === 'fewest-coins') {
          const [coins, target] = item.variant.split(':');
          expect(
            fewestCoins(coins.split(',').map(Number), Number(target)),
          ).toBe(item.answer);
        }
        const bomb = composeBomb('bomb-number-puzzles', seed, variant);
        expect(bomb.acceptedAnswers).toContain(String(item.answer));
        for (const answer of bomb.acceptedAnswers) {
          expect(bomb.prompt).not.toContain(answer);
        }
      }
    },
  );
});

describe('one batch never names the same drawing twice', () => {
  it.each([
    'bomb-what-is-it',
    'bomb-put-together',
    'bomb-thread-end',
    'bomb-odd-one-out',
  ] as const)('%s', (family) => {
    for (const job of ['j1', 'j2', 'j3', 'j4']) {
      const keys = Array.from({ length: 8 }, (_, ordinal) =>
        composeBomb(family, `${job}:${ordinal}`),
      ).map((item) => item.answerKey);
      expect(keys.every(Boolean)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('a batch across forms names each drawing once', () => {
    const keys = [0, 1, 2, 3, 4, 5].map(
      (ordinal) =>
        composeBomb(
          'bomb-put-together',
          `job-x:${ordinal}`,
          ordinal % 2 ? 'mirrored-word' : 'shattered-turned',
        ).answerKey,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('وين توصل؟ — القنبلة in المسارات والحركة', () => {
  it('walks every way the engine draws to the drawing it names', () => {
    for (const variant of PATH_BOMB_VARIANTS) {
      for (const seed of seeds.slice(0, 25)) {
        const item = composeBomb('bomb-thread-end', `${seed}:3`, variant);
        expect(item.answerKey).toBeTruthy();
        const named = /«(.+)»/.exec(item.factualClaim)![1];
        expect(item.acceptedAnswers).toContain(named);
        if (variant === 'arrows') {
          const [, start, moves] = item.variant.split(':');
          const end = walkArrows(
            start.split(',').map(Number) as [number, number],
            [...moves],
            5,
            3,
          );
          expect(item.factualClaim).toContain(`end at ${end!.join(',')}`);
        }
        if (variant === 'ball-drop') {
          const [, start, rows] = item.variant.split(':');
          const boards = rows
            .split('/')
            .map((row) => row.match(/-?\d/g)!.map(Number));
          // No board pushes the ball onto another board of its row.
          for (const row of boards) {
            row.forEach((d, i) => {
              if (d) expect(row[i + d]).toBe(0);
            });
          }
          expect(item.factualClaim).toContain(
            dropBall(boards, Number(start)).join('→'),
          );
        }
        if (variant === 'robot') {
          const [, start, facing, commands] = item.variant.split(':');
          const end = runRobot(
            start.split(',').map(Number) as [number, number],
            Number(facing),
            commands.split('|'),
            5,
            3,
          );
          expect(item.factualClaim).toContain(`ends at ${end!.join(',')}`);
        }
      }
    }
  });

  it('keeps the slow robot to one template in seven', () => {
    expect(
      SLOW_PATH_BOMB_VARIANTS.length / PATH_BOMB_VARIANTS.length,
    ).toBeLessThan(0.2);
  });
});
