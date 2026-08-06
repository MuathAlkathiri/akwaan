import { ContentItemCompatibilityPolicy } from './content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
} from './world-content.constants';
import {
  challengeType,
  contentItem,
  multipleChoicePayload,
  scope,
} from './world-content.fixtures';
import { ChallengeTypeView } from './world-content.types';

describe('ContentItemCompatibilityPolicy (roadmap 12-15)', () => {
  const policy = new ContentItemCompatibilityPolicy();

  const typeMap = (...types: ChallengeTypeView[]) =>
    new Map(types.map((type) => [type.id, type]));

  const evaluate = (
    overrides: Partial<Parameters<typeof policy.evaluate>[0]> = {},
  ) =>
    policy.evaluate({
      item: contentItem(),
      scope: scope(),
      challengeTypes: typeMap(
        challengeType({ id: 'challenge-ryo', slug: 'read-your-opponent' }),
      ),
      ...overrides,
    });

  const codes = (overrides = {}) =>
    evaluate(overrides).blockers.map((problem) => problem.code);

  it('accepts a multiple-choice item played through an RYO challenge', () => {
    // Roadmap 6.1: RYO wraps a multiple-choice prompt, so the item is reusable
    // as-is rather than needing a separate RYO-shaped copy.
    expect(evaluate().blockers).toEqual([]);
  });

  it('requires the item to belong to an existing Scope', () => {
    expect(codes({ scope: undefined })).toContain('CONTENT_SCOPE_MISSING');
  });

  it('requires the denormalized World to match the Scope World', () => {
    expect(codes({ item: contentItem({ worldId: 'world-anime' }) })).toContain(
      'CONTENT_WORLD_SCOPE_MISMATCH',
    );
  });

  it('rejects a compatible challenge type that does not exist', () => {
    expect(
      codes({
        item: contentItem({ compatibleChallengeTypeIds: ['challenge-ghost'] }),
      }),
    ).toContain('COMPATIBLE_CHALLENGE_TYPE_MISSING');
  });

  it('cannot be made ready with no compatible challenge type', () => {
    expect(
      codes({ item: contentItem({ compatibleChallengeTypeIds: [] }) }),
    ).toContain('CONTENT_WITHOUT_COMPATIBLE_CHALLENGE_TYPE');
  });

  it('rejects a challenge type the Scope excludes', () => {
    expect(
      codes({
        scope: scope({ excludedChallengeTypeIds: ['challenge-ryo'] }),
      }),
    ).toContain('CHALLENGE_TYPE_EXCLUDED_BY_SCOPE');
  });

  it('rejects a payload mode the challenge cannot resolve', () => {
    expect(
      codes({
        challengeTypes: typeMap(
          challengeType({
            id: 'challenge-ryo',
            family: ChallengeFamily.RELATIONAL,
            answerMode: ChallengeAnswerMode.VOTE,
          }),
        ),
      }),
    ).toContain('ANSWER_PAYLOAD_INCOMPATIBLE_WITH_CHALLENGE');
  });

  it('rejects an unknown answer payload discriminator', () => {
    expect(
      codes({
        item: contentItem({
          answerPayload: { mode: 'freetext' } as never,
        }),
      }),
    ).toContain('UNKNOWN_ANSWER_PAYLOAD_MODE');
  });

  it('requires the correct option to exist in the option list', () => {
    expect(
      codes({
        item: contentItem({
          answerPayload: multipleChoicePayload({ correctOptionId: 'spain' }),
        }),
      }),
    ).toContain('CORRECT_OPTION_NOT_IN_OPTIONS');
  });

  it('requires at least two multiple-choice options', () => {
    expect(
      codes({
        item: contentItem({
          answerPayload: multipleChoicePayload({
            options: [{ id: 'france', label: { ar: 'فرنسا' } }],
          }),
        }),
      }),
    ).toContain('ANSWER_OPTIONS_REQUIRED');
  });

  it('requires accepted answers for match mode', () => {
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: [],
          },
        }),
        challengeTypes: typeMap(
          challengeType({
            id: 'challenge-ryo',
            family: ChallengeFamily.COOP,
            answerMode: ChallengeAnswerMode.MATCH,
          }),
        ),
      }),
    ).toContain('ACCEPTED_ANSWERS_REQUIRED');
  });

  it('detects accepted answers that collapse to the same normalized value', () => {
    // Uses the one shared Arabic normalizer, so tashkeel and alef variants are
    // recognised as the same answer (roadmap 6.5).
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['الأهلي', 'الاهلي'],
          },
        }),
        challengeTypes: typeMap(
          challengeType({
            id: 'challenge-ryo',
            family: ChallengeFamily.COOP,
            answerMode: ChallengeAnswerMode.MATCH,
          }),
        ),
      }),
    ).toContain('DUPLICATE_ACCEPTED_ANSWER');
  });

  it('validates closest-mode numbers and tolerance', () => {
    const coopClosest = challengeType({
      id: 'challenge-ryo',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.CLOSEST,
    });
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.CLOSEST,
            correctValue: Number.NaN,
            acceptedTolerance: -1,
          },
        }),
        challengeTypes: typeMap(coopClosest),
      }),
    ).toEqual(
      expect.arrayContaining([
        'NUMERIC_ANSWER_REQUIRED',
        'INVALID_ANSWER_TOLERANCE',
      ]),
    );
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.CLOSEST,
            correctValue: 12,
            acceptedTolerance: 2,
          },
        }),
        challengeTypes: typeMap(coopClosest),
      }),
    ).toEqual([]);
  });

  it('validates split payload structure', () => {
    const coopSplit = challengeType({
      id: 'challenge-ryo',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.SPLIT,
    });
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.SPLIT,
            splitPayload: { fragments: [{ seat: 1, clue: { ar: 'نصف' } }] },
            acceptedAnswers: ['ميسي'],
          },
        }),
        challengeTypes: typeMap(coopSplit),
      }),
    ).toContain('SPLIT_PAYLOAD_REQUIRES_FRAGMENTS');

    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.SPLIT,
            splitPayload: {
              fragments: [
                { seat: 1, clue: { ar: 'نصف' } },
                { seat: 1, clue: { ar: 'النصف الآخر' } },
              ],
            },
            acceptedAnswers: ['ميسي'],
          },
        }),
        challengeTypes: typeMap(coopSplit),
      }),
    ).toContain('DUPLICATE_SPLIT_FRAGMENT_SEAT');
  });

  it('validates vote consensus rules', () => {
    const relational = challengeType({
      id: 'challenge-ryo',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
    });
    expect(
      codes({
        item: contentItem({
          answerPayload: {
            mode: ChallengeAnswerMode.VOTE,
            consensusRule: 'unanimous' as unknown as VoteConsensusRule,
          },
        }),
        challengeTypes: typeMap(relational),
      }),
    ).toContain('INVALID_VOTE_CONSENSUS_RULE');
  });

  it('requires an RYO item to be multiple choice or a numeric estimate', () => {
    const ryo = challengeType({ id: 'challenge-ryo' });
    expect(
      codes({
        item: contentItem({
          answerPayload: { mode: ChallengeAnswerMode.RYO, options: null },
        }),
        challengeTypes: typeMap(ryo),
      }),
    ).toContain('RYO_PAYLOAD_INCOMPLETE');
  });

  it('validates a complete poison deck while preserving missing variant as classic', () => {
    const top10 = challengeType({
      id: 'challenge-ryo',
      slug: 'top-10',
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.TOP_10,
    });
    const candidates = Array.from({ length: 14 }, (_, index) => ({
      id: `card-${index + 1}`,
      label: `بطاقة ${index + 1}`,
    }));
    const poisonItem = contentItem({
      answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
      mechanicPayload: {
        variant: 'poison-deck',
        title: 'أفضل عشرة',
        instruction: 'احتفظ بالبطاقة أو أرسلها لخصمك',
        rankingBasis: 'الترتيب الرسمي',
        sourceLabel: 'المصدر الرسمي',
        sourceUrl: 'https://example.com/ranking',
        asOfDate: '2026-08-04',
        candidates,
        rankedAnswer: candidates.slice(0, 10).map((candidate, index) => ({
          candidateId: candidate.id,
          rank: index + 1,
        })),
        decoyCandidateIds: candidates
          .slice(10)
          .map((candidate) => candidate.id),
      },
    });
    expect(codes({ item: poisonItem, challengeTypes: typeMap(top10) })).toEqual(
      [],
    );
    expect(
      codes({
        item: contentItem({
          answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
        }),
        challengeTypes: typeMap(top10),
      }),
    ).toEqual([]);

    expect(
      codes({
        item: contentItem({
          ...poisonItem,
          mechanicPayload: {
            ...poisonItem.mechanicPayload,
            decoyCandidateIds: ['card-1', 'card-11', 'card-12', 'card-13'],
          },
        }),
        challengeTypes: typeMap(top10),
      }),
    ).toEqual(
      expect.arrayContaining([
        'TOP10_CANDIDATE_OVERLAP',
        'TOP10_CLASSIFICATION_INCOMPLETE',
      ]),
    );
  });

  it('accepts every medium through the same mechanic, and requires assets when a type is set', () => {
    // Media belongs to the ContentItem, so one mechanic plays text, image,
    // audio, and video without any per-mechanic media configuration.
    expect(evaluate().blockers).toEqual([]);
    for (const type of [
      ContentMediaType.IMAGE,
      ContentMediaType.AUDIO,
      ContentMediaType.VIDEO,
    ]) {
      expect(
        codes({
          item: contentItem({ media: { type, assets: [{ url: '/asset' }] } }),
        }),
      ).toEqual([]);
    }
    expect(
      codes({
        item: contentItem({
          media: { type: ContentMediaType.IMAGE, assets: [] },
        }),
      }),
    ).toContain('CONTENT_MEDIA_ASSETS_REQUIRED');
  });

  it('requires an Arabic prompt', () => {
    expect(codes({ item: contentItem({ prompt: { ar: '  ' } }) })).toContain(
      'CONTENT_PROMPT_REQUIRED',
    );
  });

  it('lets Relational-only content be marked reusable across sessions', () => {
    const relational = challengeType({
      id: 'challenge-relational',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
    });
    const report = policy.evaluate({
      item: contentItem({
        compatibleChallengeTypeIds: [relational.id],
        answerPayload: {
          mode: ChallengeAnswerMode.VOTE,
          consensusRule: VoteConsensusRule.MAJORITY,
        },
        isReusableAcrossSessions: true,
        status: ContentItemStatus.READY,
      }),
      scope: scope(),
      challengeTypes: typeMap(relational),
    });
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(policy.isSessionReuseExempt([ChallengeFamily.RELATIONAL])).toBe(
      true,
    );
    expect(
      policy.defaultReuseAcrossSessions([ChallengeFamily.RELATIONAL]),
    ).toBe(true);
  });

  it('does not exempt content that is also playable outside Relational', () => {
    expect(
      policy.isSessionReuseExempt([
        ChallengeFamily.RELATIONAL,
        ChallengeFamily.RYO,
      ]),
    ).toBe(false);
    expect(policy.defaultReuseAcrossSessions([ChallengeFamily.RYO])).toBe(
      false,
    );
    expect(
      evaluate({
        item: contentItem({ isReusableAcrossSessions: true }),
      }).warnings.map((problem) => problem.code),
    ).toContain('NON_RELATIONAL_CONTENT_MARKED_REUSABLE');
  });

  it('rejects legacy point and difficulty fields', () => {
    const problems = policy
      .findLegacyFields({
        points: 400,
        difficulty: 'hard',
        correctAnswer: 'فرنسا',
        hostDecision: 'approved',
      })
      .map((problem) => problem.details?.field);
    expect(problems).toEqual([
      'points',
      'difficulty',
      'correctAnswer',
      'hostDecision',
    ]);
    expect(policy.findLegacyFields({ prompt: { ar: 'سؤال' } })).toEqual([]);
  });
});
