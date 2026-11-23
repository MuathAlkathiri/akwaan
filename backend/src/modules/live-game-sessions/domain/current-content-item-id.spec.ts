import { BOMB_GAMEPLAY_PLUGIN } from './bomb-gameplay.plugin';
import { CLOSEST_GAMEPLAY_PLUGIN } from './closest-gameplay.plugin';
import { COMBO_GAMEPLAY_PLUGIN } from './combo-gameplay.plugin';
import { EKSHIFNI_GAMEPLAY_PLUGIN } from './ekshifni-gameplay.plugin';
import { FIRST_NOTE_GAMEPLAY_PLUGIN } from './first-note-gameplay.plugin';
import { LA_TAHRIQHA_GAMEPLAY_PLUGIN } from './la-tahriqha-gameplay.plugin';
import { LAQATHA_GAMEPLAY_PLUGIN } from './laqatha-gameplay.plugin';
import { MARHALA_GAMEPLAY_PLUGIN } from './marhala-gameplay.plugin';
import { MOVING_XO_GAMEPLAY_PLUGIN } from './moving-xo-gameplay.plugin';
import { ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN } from './odd-piece-hotspot-gameplay.plugin';
import { ONE_CLUE_GAMEPLAY_PLUGIN } from './one-clue-gameplay.plugin';
import { RYO_GAMEPLAY_PLUGIN } from './ryo-gameplay.plugin';

/**
 * Which authored question a player is looking at.
 *
 * A player's opinion is worthless if it lands on the wrong question, and worse
 * than worthless if it quietly lands on the right id for the wrong reason. So
 * these pin the id against the runtime the surfaces actually render, and pin
 * silence everywhere the answer would be a guess.
 *
 * The control that reads this used to live inside the ريو panel alone, which
 * is why nine challenges out of ten never offered it. Every mechanic that
 * shows one authored question should answer here.
 */
describe('currentContentItemId', () => {
  const runtime = (ids: string[]) => ({
    itemsJson: JSON.stringify(ids.map((id, itemIndex) => ({ id, itemIndex }))),
  });

  describe('اقرأ خصمك', () => {
    const ask = RYO_GAMEPLAY_PLUGIN.currentContentItemId!;

    it('names the item the round is on, not the first one', () => {
      expect(ask(runtime(['a', 'b', 'c']), { itemIndex: 2 })).toBe('c');
    });

    it('follows the round forward', () => {
      const state = runtime(['a', 'b', 'c']);
      expect([0, 1, 2].map((i) => ask(state, { itemIndex: i }))).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('says nothing when the round has not named an item', () => {
      expect(ask(runtime(['a']), {})).toBeUndefined();
    });

    it('says nothing when the index is past the end', () => {
      // A runtime that has moved on must not hand back the last item as though
      // it were the current one.
      expect(ask(runtime(['a', 'b']), { itemIndex: 5 })).toBeUndefined();
    });

    it('says nothing for a negative index', () => {
      expect(ask(runtime(['a']), { itemIndex: -1 })).toBeUndefined();
    });

    it('survives a malformed runtime rather than breaking the snapshot', () => {
      // Every surface reads this projection; one bad field must not blank it.
      expect(ask({ itemsJson: 'not json' }, { itemIndex: 0 })).toBeUndefined();
      expect(ask({}, { itemIndex: 0 })).toBeUndefined();
    });

    it('says nothing when the item carries no id', () => {
      expect(
        ask(
          { itemsJson: JSON.stringify([{ itemIndex: 0 }]) },
          { itemIndex: 0 },
        ),
      ).toBeUndefined();
    });
  });
  describe('bomb', () => {
    const ask = BOMB_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      questionsJson: JSON.stringify([
        { id: 'run', items: ids.map((id) => ({ id })) },
      ]),
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), { questionId: 'run', itemIndex: 1 })).toBe('b');
      expect(ask(state(ids, 2), { questionId: 'run', itemIndex: 2 })).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(
        ask({ questionsJson: '{' }, { questionId: 'run', itemIndex: 0 }),
      ).toBeUndefined();
    });
  });

  describe('closest', () => {
    const ask = CLOSEST_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      itemsJson: JSON.stringify(ids.map((id) => ({ id: id }))),
      currentItemIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ itemsJson: '{', currentItemIndex: 0 }, {})).toBeUndefined();
    });
  });

  describe('combo', () => {
    const ask = COMBO_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      questionPlanJson: JSON.stringify([
        ids.map((contentItemId) => ({ contentItemId })),
      ]),
      runIndex: 0,
      questionIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(
        ask({ questionPlanJson: '{', runIndex: 0, questionIndex: 0 }, {}),
      ).toBeUndefined();
    });
  });

  describe('ekshifni', () => {
    const ask = EKSHIFNI_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      imagesJson: JSON.stringify(ids.map((id) => ({ contentItemId: id }))),
      currentImageIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(
        ask({ imagesJson: '{', currentImageIndex: 0 }, {}),
      ).toBeUndefined();
    });
  });

  describe('first-note', () => {
    const ask = FIRST_NOTE_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      songsJson: JSON.stringify(ids.map((id) => ({ contentItemId: id }))),
      currentSongIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ songsJson: '{', currentSongIndex: 0 }, {})).toBeUndefined();
    });
  });

  describe('la-tahriqha', () => {
    const ask = LA_TAHRIQHA_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      dishesJson: JSON.stringify(ids.map((id) => ({ id: id }))),
      currentDishIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ dishesJson: '{', currentDishIndex: 0 }, {})).toBeUndefined();
    });
  });

  describe('laqatha', () => {
    const ask = LAQATHA_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      questionsJson: JSON.stringify(ids.map((id) => ({ contentItemId: id }))),
      currentQuestionIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(
        ask({ questionsJson: '{', currentQuestionIndex: 0 }, {}),
      ).toBeUndefined();
    });
  });

  describe('marhala', () => {
    const ask = MARHALA_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      questionJson: JSON.stringify({ contentItemId: ids[i] }),
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ questionJson: '{' }, {})).toBeUndefined();
    });
  });

  describe('moving-xo', () => {
    const ask = MOVING_XO_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) =>
      ({ question: { contentItemId: ids[i] } }) as unknown as Parameters<
        typeof ask
      >[0];

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ question: null }, {})).toBeUndefined();
    });
  });

  describe('odd-piece', () => {
    const ask = ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      puzzlesJson: JSON.stringify(ids.map((id) => ({ id: id }))),
      currentPuzzleIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(
        ask({ puzzlesJson: '{', currentPuzzleIndex: 0 }, {}),
      ).toBeUndefined();
    });
  });

  describe('one-clue', () => {
    const ask = ONE_CLUE_GAMEPLAY_PLUGIN.currentContentItemId!;
    const state = (ids: string[], i: number) => ({
      itemsJson: JSON.stringify(ids.map((id) => ({ id: id }))),
      currentItemIndex: i,
    });

    it('names a non-zero item and follows the round forward', () => {
      const ids = ['a', 'b', 'c'];
      expect(ask(state(ids, 1), {})).toBe('b');
      expect(ask(state(ids, 2), {})).toBe('c');
    });

    it('is silent for malformed runtime', () => {
      expect(ask({ itemsJson: '{', currentItemIndex: 0 }, {})).toBeUndefined();
    });
  });
});
