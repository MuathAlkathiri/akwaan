import { CategoryGameplayMode } from '../../categories/schemas/category.schema';
import {
  BombQuestionContent,
  QuestionGameplayType,
} from '../schemas/question.schema';
import { BombQuestionPolicy } from './bomb-question.policy';

describe('BombQuestionPolicy', () => {
  const policy = new BombQuestionPolicy();
  const item = (index: number) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    order: index + 20,
    image: {
      url: `/uploads/questions/bomb-items/${index}.webp`,
      storageKey: `uploads/questions/bomb-items/${index}.webp`,
      mimetype: 'image/webp',
      size: 100,
    },
    acceptedAnswers: [` إجابة ${index} `],
  });
  const content = (count: number): BombQuestionContent => ({
    items: Array.from({ length: count }, (_, index) => item(index)),
  });

  it.each([10, 15])('accepts and orders a valid %s-item sequence', (count) => {
    const result = policy.normalize({
      categoryMode: CategoryGameplayMode.BOMB,
      questionType: QuestionGameplayType.BOMB_SEQUENCE,
      bombContent: content(count),
    });
    expect(result?.items).toHaveLength(count);
    expect(result?.items.map((entry) => entry.order)).toEqual(
      Array.from({ length: count }, (_, index) => index),
    );
  });

  it.each([
    [9, 'INVALID_BOMB_ITEM_COUNT'],
    [16, 'INVALID_BOMB_ITEM_COUNT'],
  ])('rejects an invalid item count', (count, code) => {
    expect(() =>
      policy.normalize({
        categoryMode: CategoryGameplayMode.BOMB,
        questionType: QuestionGameplayType.BOMB_SEQUENCE,
        bombContent: content(count as number),
      }),
    ).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code }) }),
    );
  });

  it('rejects missing images, answers, duplicate IDs, and normalized answers', () => {
    const cases = [
      {
        mutate(value: BombQuestionContent) {
          value.items[0].image.url = '';
        },
        code: 'BOMB_ITEM_IMAGE_REQUIRED',
      },
      {
        mutate(value: BombQuestionContent) {
          value.items[0].acceptedAnswers = [];
        },
        code: 'BOMB_ITEM_ANSWER_REQUIRED',
      },
      {
        mutate(value: BombQuestionContent) {
          value.items[1].id = value.items[0].id;
        },
        code: 'DUPLICATE_BOMB_ITEM_ID',
      },
      {
        mutate(value: BombQuestionContent) {
          value.items[0].acceptedAnswers = ['السعودية', '  السعودية  '];
        },
        code: 'DUPLICATE_ACCEPTED_ANSWER',
      },
    ];
    for (const testCase of cases) {
      const value = content(10);
      testCase.mutate(value);
      expect(() =>
        policy.normalize({
          categoryMode: CategoryGameplayMode.BOMB,
          questionType: QuestionGameplayType.BOMB_SEQUENCE,
          bombContent: value,
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: testCase.code }),
        }),
      );
    }
  });

  it('enforces category and question discriminator compatibility', () => {
    expect(() =>
      policy.normalize({
        categoryMode: CategoryGameplayMode.STANDARD,
        questionType: QuestionGameplayType.BOMB_SEQUENCE,
        bombContent: content(10),
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'BOMB_CONTENT_NOT_ALLOWED' }),
      }),
    );
    expect(() =>
      policy.normalize({
        categoryMode: CategoryGameplayMode.BOMB,
        questionType: QuestionGameplayType.STANDARD,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'BOMB_SEQUENCE_REQUIRED' }),
      }),
    );
    expect(
      policy.normalize({
        categoryMode: CategoryGameplayMode.STANDARD,
        questionType: QuestionGameplayType.STANDARD,
      }),
    ).toBeUndefined();
  });
});
