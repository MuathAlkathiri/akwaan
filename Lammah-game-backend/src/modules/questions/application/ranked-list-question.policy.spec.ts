import { BadRequestException } from '@nestjs/common';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  QuestionGameplayType,
  RankedListDefinition,
} from '../schemas/question.schema';
import {
  RankedListQuestionPolicy,
  TOP_10_ENTRY_POINTS,
} from './ranked-list-question.policy';

const definition = (): RankedListDefinition => ({
  displayName: { ar: 'توب 10', en: 'Top 10' },
  entries: TOP_10_ENTRY_POINTS.map((points, index) => ({
    id: `entry-${index + 1}`,
    rank: index + 1,
    answer: {
      ar: `لاعب ${index + 1}`,
      en: `Player ${index + 1}`,
    },
    aliases: [`p${index + 1}`],
    points,
  })),
});

describe('RankedListQuestionPolicy', () => {
  const policy = new RankedListQuestionPolicy();

  it('normalizes a valid Top 10 and preserves exact displayed points', () => {
    const value = policy.normalize({
      questionType: QuestionGameplayType.RANKED_LIST,
      question: 'اذكر أفضل عشرة لاعبين',
      rankedList: definition(),
    });
    expect(value).toMatchObject({
      questionType: 'ranked_list',
      maxPoints: 600,
      points: 600,
      turnDurationSeconds: 15,
      maxStrikesPerTeam: 3,
    });
    expect(
      (value.rankedList as RankedListDefinition).entries.reduce(
        (sum, entry) => sum + entry.points,
        0,
      ),
    ).toBe(600);
  });

  it('derives rank and points from array order despite client manipulation', () => {
    const input = definition();
    input.entries.forEach((entry) => {
      entry.rank = 10;
      entry.points = 1;
    });
    const value = policy.normalize({
      questionType: QuestionGameplayType.RANKED_LIST,
      question: 'اذكر أفضل عشرة لاعبين',
      rankedList: input,
    });
    expect((value.rankedList as RankedListDefinition).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rank: 1, points: 10 }),
        expect.objectContaining({ rank: 10, points: 130 }),
      ]),
    );
  });

  it('returns structured cross-entry alias conflicts', () => {
    const value = definition();
    value.entries[1].aliases = ['لَاعِب 1'];
    try {
      policy.validate(value);
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'RANKED_LIST_ACCEPTED_ANSWER_CONFLICT',
          conflicts: [
            expect.objectContaining({
              code: 'CROSS_ENTRY_ALIAS_CONFLICT',
              entryIndex: 1,
              conflictingEntryIndex: 0,
              normalizedValue: 'لاعب 1',
            }),
          ],
        }),
      );
    }
  });

  it.each([
    ['DUPLICATE_ALIAS', ['اختصار', 'إختصار']],
    ['ALIAS_EQUALS_CANONICAL', ['لاعب 1']],
    ['BLANK_ALIAS', ['   ']],
  ])('detects %s inside one entry', (code, aliases) => {
    const value = definition();
    value.entries[0].aliases = aliases;
    expect(() => policy.validate(value)).toThrow(BadRequestException);
    try {
      policy.validate(value);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          conflicts: expect.arrayContaining([
            expect.objectContaining({ code }),
          ]),
        }),
      );
    }
  });

  it('rejects a client maxPoints value other than 600', () => {
    expect(() =>
      policy.normalize({
        questionType: QuestionGameplayType.RANKED_LIST,
        question: 'اذكر أفضل عشرة لاعبين',
        maxPoints: 500,
        rankedList: definition(),
      }),
    ).toThrow(BadRequestException);
  });

  it('normalizes Arabic and English safely without fuzzy matching', () => {
    expect(normalizeAnswer('  كِرِيْسْتِيَانُو رُونَالْدُو! ')).toBe(
      normalizeAnswer('كريستيانو رونالدو'),
    );
    expect(normalizeAnswer('Ángel Di María')).toBe('angel di maria');
    expect(normalizeAnswer('السُّعُودِيَّة')).toBe(normalizeAnswer('سعودية'));
    expect(normalizeAnswer('السعوديه')).toBe(normalizeAnswer('السعودية'));
    expect(normalizeAnswer('رونالدو')).not.toBe(normalizeAnswer('رونالدينيو'));
  });
});
