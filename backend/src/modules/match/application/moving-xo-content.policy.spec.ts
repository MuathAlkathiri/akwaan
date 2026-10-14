import { ConfigService } from '@nestjs/config';
import {
  MOVING_XO_DEFAULT_MIN_USABLE_ITEMS,
  movingXoMinimumUsableItems,
  readMovingXoQuestion,
} from './moving-xo-content.policy';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  scopeId: 'scope-1',
  scopeSlug: 'wordplay-letters',
  prompt: { ar: 'ما الكلمة؟' },
  answerPayload: { mode: 'match', acceptedAnswers: ['مثلث'] },
  ...overrides,
});

describe('Moving XO runtime content policy', () => {
  it('defaults the usable inventory floor to 24 and accepts an override', () => {
    expect(movingXoMinimumUsableItems(new ConfigService())).toBe(
      MOVING_XO_DEFAULT_MIN_USABLE_ITEMS,
    );
    expect(
      movingXoMinimumUsableItems(
        new ConfigService({ MOVING_XO_MIN_USABLE_ITEMS: '12' }),
      ),
    ).toBe(12);
  });

  it.each(['0', '-1', '1.5', 'many'])(
    'rejects invalid inventory configuration %s',
    (value) => {
      expect(() =>
        movingXoMinimumUsableItems(
          new ConfigService({ MOVING_XO_MIN_USABLE_ITEMS: value }),
        ),
      ).toThrow(/positive integer/);
    },
  );

  it('accepts match and multiple_choice only', () => {
    expect(readMovingXoQuestion(candidate()).ok).toBe(true);
    expect(
      readMovingXoQuestion(
        candidate({
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'أ' } },
              { id: 'b', label: { ar: 'ب' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ).ok,
    ).toBe(true);
    expect(
      readMovingXoQuestion(candidate({ answerPayload: { mode: 'closest' } })),
    ).toEqual({ ok: false, code: 'MOVING_XO_ANSWER_MODE_UNSUPPORTED' });
  });

  it.each([
    [
      'numeric match answer',
      { answerPayload: { mode: 'match', acceptedAnswers: ['42'] } },
      'MOVING_XO_MATCH_ANSWER_NUMERIC',
    ],
    ['blank prompt', { prompt: { ar: '' } }, 'MOVING_XO_PROMPT_INVALID'],
    [
      'legacy scope',
      { scopeSlug: 'legacy-scope' },
      'MOVING_XO_SCOPE_NOT_FORWARD',
    ],
    [
      'incomplete choices',
      {
        answerPayload: {
          mode: 'multiple_choice',
          options: [{ id: 'a', label: { ar: 'أ' } }],
          correctOptionId: 'a',
        },
      },
      'MOVING_XO_MULTIPLE_CHOICE_INVALID',
    ],
    [
      'missing choice answer key',
      {
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'أ' } },
            { id: 'b', label: { ar: 'ب' } },
          ],
        },
      },
      'MOVING_XO_MULTIPLE_CHOICE_INVALID',
    ],
    [
      'invalid match payload',
      { answerPayload: { mode: 'match', acceptedAnswers: [' ', 'جواب'] } },
      'MOVING_XO_MATCH_ANSWER_INVALID',
    ],
  ])('rejects %s', (_label, overrides, code) => {
    expect(readMovingXoQuestion(candidate(overrides))).toEqual({
      ok: false,
      code,
    });
  });

  it.each(['observation-illusions', 'assembly-rotation', 'paths-motion'])(
    'requires resolved media for visual scope %s',
    (scopeSlug) => {
      expect(readMovingXoQuestion(candidate({ scopeSlug }))).toEqual({
        ok: false,
        code: 'PUZZLE_SCOPE_REQUIRES_MEDIA',
      });
      expect(
        readMovingXoQuestion(
          candidate({
            scopeSlug,
            media: {
              type: 'image',
              assets: [{ url: 'https://assets.example/puzzle.png' }],
            },
          }),
        ).ok,
      ).toBe(true);
    },
  );
});
