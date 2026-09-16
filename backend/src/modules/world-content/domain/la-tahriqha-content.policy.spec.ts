import {
  scoreLaTahriqhaDish,
  validateLaTahriqhaPayload,
} from './la-tahriqha-content.policy';
import { LaTahriqhaPayload } from './world-content.types';

const dish = (): LaTahriqhaPayload => ({
  variant: 'la-tahriqha',
  dishName: { ar: 'كبسة دجاج' },
  ingredients: [
    ...[1, 2, 3, 4, 5].map((index) => ({
      localId: `correct-${index}`,
      label: { ar: `مكوّن ${index}` },
      correct: true,
    })),
    ...[1, 2, 3].map((index) => ({
      localId: `distractor-${index}`,
      label: { ar: `محتمل ${index}` },
      correct: false,
    })),
  ],
});

const codes = (payload: Partial<LaTahriqhaPayload>) =>
  validateLaTahriqhaPayload(payload).map((problem) => problem.code);

describe('لا تحرقها content contract', () => {
  it('accepts exactly eight cards split five correct and three distractors', () => {
    expect(validateLaTahriqhaPayload(dish())).toEqual([]);
  });

  it('rejects a payload that is not the canonical variant', () => {
    expect(codes({ ...dish(), variant: undefined })).toContain(
      'LA_TAHRIQHA_PAYLOAD_REQUIRED',
    );
  });

  it('rejects a dish with no name', () => {
    expect(codes({ ...dish(), dishName: { ar: '   ' } })).toContain(
      'LA_TAHRIQHA_DISH_NAME_REQUIRED',
    );
  });

  it('rejects any count other than eight cards', () => {
    const payload = dish();
    payload.ingredients = payload.ingredients.slice(0, 7);
    expect(codes(payload)).toContain('LA_TAHRIQHA_INGREDIENT_COUNT_INVALID');
  });

  it('rejects duplicate ingredient ids so a selection cannot drift', () => {
    const payload = dish();
    payload.ingredients[7].localId = payload.ingredients[0].localId;
    expect(codes(payload)).toContain('LA_TAHRIQHA_INGREDIENT_IDS_INVALID');
  });

  it('rejects an unlabelled ingredient', () => {
    const payload = dish();
    payload.ingredients[3].label = { ar: '' };
    expect(codes(payload)).toContain('LA_TAHRIQHA_INGREDIENT_LABEL_REQUIRED');
  });

  it('requires every card to state its correctness explicitly', () => {
    const payload = dish();
    delete (payload.ingredients[2] as { correct?: boolean }).correct;
    expect(codes(payload)).toContain(
      'LA_TAHRIQHA_INGREDIENT_CORRECTNESS_REQUIRED',
    );
  });

  it('rejects any split other than five correct and three distractors', () => {
    const payload = dish();
    payload.ingredients[0].correct = false;
    expect(codes(payload)).toEqual(
      expect.arrayContaining([
        'LA_TAHRIQHA_CORRECT_COUNT_INVALID',
        'LA_TAHRIQHA_DISTRACTOR_COUNT_INVALID',
      ]),
    );
  });

  it('accepts an authored dish window and rejects a nonsensical one', () => {
    expect(validateLaTahriqhaPayload({ ...dish(), timerSeconds: 45 })).toEqual(
      [],
    );
    expect(codes({ ...dish(), timerSeconds: 2 })).toContain(
      'LA_TAHRIQHA_TIMER_INVALID',
    );
  });
});

describe('لا تحرقها dish scoring', () => {
  const ingredients = dish().ingredients;
  const score = (selected: string[]) =>
    scoreLaTahriqhaDish(ingredients, selected);

  it('pays the count for three and four correct', () => {
    expect(score(['correct-1', 'correct-2', 'correct-3']).points).toBe(3);
    expect(
      score(['correct-1', 'correct-2', 'correct-3', 'correct-4']).points,
    ).toBe(4);
  });

  it('pays seven for the exact recipe and marks it perfect', () => {
    const grade = score([
      'correct-1',
      'correct-2',
      'correct-3',
      'correct-4',
      'correct-5',
    ]);
    expect(grade.points).toBe(7);
    expect(grade.perfect).toBe(true);
    expect(grade.burned).toBe(false);
  });

  it('burns the whole dish for one wrong card, with no partial credit', () => {
    const grade = score([
      'correct-1',
      'correct-2',
      'correct-3',
      'correct-4',
      'distractor-1',
    ]);
    expect(grade.points).toBe(0);
    expect(grade.burned).toBe(true);
    expect(grade.perfect).toBe(false);
    expect(grade.correctIds).toHaveLength(4);
    expect(grade.wrongIds).toEqual(['distractor-1']);
  });

  it('scores fewer than three committed cards as zero without filling them in', () => {
    const grade = score(['correct-1', 'correct-2']);
    expect(grade.points).toBe(0);
    expect(grade.understaffed).toBe(true);
    expect(grade.burned).toBe(false);
  });

  it('counts an unauthored id as wrong rather than as nothing', () => {
    const grade = score(['correct-1', 'correct-2', 'correct-3', 'invented']);
    expect(grade.burned).toBe(true);
    expect(grade.wrongIds).toEqual(['invented']);
    expect(grade.points).toBe(0);
  });

  it('deduplicates a repeated selection rather than paying for it twice', () => {
    const grade = score([
      'correct-1',
      'correct-1',
      'correct-2',
      'correct-3',
      'correct-4',
      'correct-5',
    ]);
    expect(grade.points).toBe(7);
    expect(grade.perfect).toBe(true);
  });
});
