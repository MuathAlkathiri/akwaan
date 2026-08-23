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

  it('enforces five ordered weighted clues for One Clue content', () => {
    const oneClue = challengeType({
      id: 'challenge-ryo',
      slug: 'one-clue',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.ONE_CLUE,
    });
    const item = contentItem({
      answerPayload: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: ['الهلال'],
      },
      mechanicPayload: {
        clues: [5, 4, 3, 2, 1].map((value, index) => ({
          order: index + 1,
          value,
          text: { ar: `دليل ${index + 1}` },
        })),
      },
    });
    expect(
      evaluate({ item, challengeTypes: typeMap(oneClue) }).blockers,
    ).toEqual([]);
    expect(
      codes({
        item: contentItem({
          ...item,
          mechanicPayload: { clues: [] },
        }),
        challengeTypes: typeMap(oneClue),
      }),
    ).toContain('ONE_CLUE_STRUCTURE_INVALID');

    for (const clues of [
      [5, 4, 3, 2],
      [6, 5, 4, 3, 2, 1],
      [4, 5, 3, 2, 1],
    ]) {
      expect(
        codes({
          item: contentItem({
            ...item,
            mechanicPayload: {
              clues: clues.map((value, index) => ({
                order: index + 1,
                value,
                text: { ar: `دليل ${index + 1}` },
              })),
            },
          }),
          challengeTypes: typeMap(oneClue),
        }),
      ).toContain('ONE_CLUE_STRUCTURE_INVALID');
    }
  });

  it('does not cross-match One Clue and ركّبها content patterns', () => {
    const oneClue = challengeType({
      id: 'one-clue',
      slug: 'one-clue',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.ONE_CLUE,
    });
    const distributed = challengeType({
      id: 'distributed',
      slug: 'distributed-information',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.DISTRIBUTED,
    });
    const oneClueItem = contentItem({
      compatibleChallengeTypeIds: ['one-clue', 'distributed'],
      answerPayload: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: ['الهلال'],
      },
      mechanicPayload: {
        clues: [5, 4, 3, 2, 1].map((value, index) => ({
          order: index + 1,
          value,
          text: { ar: `دليل ${index + 1}` },
        })),
      },
    });
    expect(
      codes({
        item: oneClueItem,
        challengeTypes: typeMap(oneClue, distributed),
      }),
    ).toContain('DISTRIBUTED_INFORMATION_STRUCTURE_REQUIRED');

    expect(
      codes({
        item: contentItem({
          compatibleChallengeTypeIds: ['one-clue'],
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['الهلال'],
          },
          mechanicPayload: { variant: 'three-segment-race' },
        }),
        challengeTypes: typeMap(oneClue),
      }),
    ).toContain('ONE_CLUE_STRUCTURE_INVALID');
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

  describe('Top 5 content contract', () => {
    const top5 = challengeType({
      id: 'challenge-top-5',
      slug: 'top-5',
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.TOP_5,
    });
    const entry = (index: number, rank: number | null) => ({
      id: `entry-${index}`,
      label: `مدخل ${index}`,
      rank,
    });
    // Five ranked 1..5 and five traps: the only shape the mechanic can score.
    const validEntries = [
      ...[1, 2, 3, 4, 5].map((rank) => entry(rank, rank)),
      ...[6, 7, 8, 9, 10].map((index) => entry(index, null)),
    ];
    const payload = (overrides: Record<string, unknown> = {}) => ({
      variant: 'keep-or-give',
      title: 'أفضل 5',
      instruction: 'احتفظ بالبطاقة أو دسّها للخصم',
      rankingBasis: 'الترتيب الرسمي',
      sourceLabel: 'المصدر الرسمي',
      sourceUrl: 'https://example.com/ranking',
      asOfDate: '2026-08-04',
      entries: validEntries,
      ...overrides,
    });
    const evaluateTop5 = (overrides: Record<string, unknown> = {}) =>
      codes({
        item: contentItem({
          compatibleChallengeTypeIds: [top5.id],
          answerPayload: { mode: ChallengeAnswerMode.TOP_5 },
          mechanicPayload: payload(overrides),
        }),
        challengeTypes: typeMap(top5),
      });

    it('accepts exactly ten entries with ranks 1..5 and five traps', () => {
      expect(evaluateTop5()).toEqual([]);
    });

    it('rejects anything other than ten entries', () => {
      expect(evaluateTop5({ entries: validEntries.slice(0, 9) })).toEqual(
        expect.arrayContaining(['TOP5_ENTRY_COUNT_INVALID']),
      );
      expect(
        evaluateTop5({ entries: [...validEntries, entry(11, null)] }),
      ).toEqual(expect.arrayContaining(['TOP5_ENTRY_COUNT_INVALID']));
    });

    it('rejects a rank set that is not exactly 1..5', () => {
      expect(
        evaluateTop5({
          entries: [
            ...[1, 2, 3, 4, 6].map((rank) => entry(rank, rank)),
            ...[6, 7, 8, 9, 10].map((index) => entry(index + 100, null)),
          ],
        }),
      ).toEqual(expect.arrayContaining(['TOP5_RANKS_INVALID']));
      // A repeated rank is two claims to the same position.
      expect(
        evaluateTop5({
          entries: [
            ...[1, 2, 3, 4].map((rank) => entry(rank, rank)),
            entry(50, 4),
            ...[6, 7, 8, 9, 10].map((index) => entry(index, null)),
          ],
        }),
      ).toEqual(expect.arrayContaining(['TOP5_RANKS_INVALID']));
    });

    it('rejects a ranked/trap split that is not five and five', () => {
      expect(
        evaluateTop5({
          entries: [
            ...[1, 2, 3, 4, 5].map((rank) => entry(rank, rank)),
            entry(6, 5),
            ...[7, 8, 9, 10].map((index) => entry(index, null)),
          ],
        }),
      ).toEqual(
        expect.arrayContaining([
          'TOP5_RANKED_COUNT_INVALID',
          'TOP5_TRAP_COUNT_INVALID',
        ]),
      );
    });

    it('rejects duplicate entry ids and duplicate labels', () => {
      expect(
        evaluateTop5({
          entries: [
            ...validEntries.slice(0, 9),
            { ...entry(99, null), id: 'entry-1' },
          ],
        }),
      ).toEqual(expect.arrayContaining(['TOP5_DUPLICATE_ENTRY_ID']));
      expect(
        evaluateTop5({
          entries: [
            ...validEntries.slice(0, 9),
            { id: 'entry-99', label: 'مدخل 1', rank: null },
          ],
        }),
      ).toEqual(expect.arrayContaining(['TOP5_DUPLICATE_ENTRY_LABEL']));
    });

    it('treats a missing rank as unclassified rather than a trap', () => {
      // `undefined` means the author never said; `null` means they said "trap".
      // Collapsing the two would invent a correctness claim.
      expect(
        evaluateTop5({
          entries: [
            ...validEntries.slice(0, 9),
            { id: 'entry-10', label: 'مدخل 10' },
          ],
        }),
      ).toEqual(expect.arrayContaining(['TOP5_RANK_MISSING']));
    });

    it('refuses the retired Top 10 poison-deck payload outright', () => {
      expect(evaluateTop5({ variant: 'poison-deck' })).toEqual(
        expect.arrayContaining(['TOP5_VARIANT_INVALID']),
      );
    });
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

  describe('الكومبو content contract', () => {
    // Combo plays a run of four questions of rising difficulty, so the stage is
    // the item's position in that run. It is validated here, at authoring time,
    // by the same predicate the plan builder uses at launch.
    const comboType = () =>
      challengeType({
        id: 'challenge-combo',
        slug: 'combo',
        answerMode: ChallengeAnswerMode.MATCH,
      });

    const comboItem = (comboStage: unknown) =>
      contentItem({
        compatibleChallengeTypeIds: ['challenge-combo'],
        answerPayload: {
          mode: ChallengeAnswerMode.MATCH,
          acceptedAnswers: ['ناروتو'],
        },
        ...(comboStage === undefined
          ? {}
          : { mechanicPayload: { comboStage } }),
      });

    const comboCodes = (comboStage: unknown) =>
      codes({
        item: comboItem(comboStage),
        challengeTypes: typeMap(comboType()),
      });

    it.each([1, 2, 3, 4])('accepts stage %s', (stage) => {
      expect(comboCodes(stage)).not.toContain('COMBO_ITEM_STAGE_INVALID');
    });

    it('rejects an item authored with no stage at all', () => {
      // Saving cleanly and failing at launch is the worst time to find this.
      expect(comboCodes(undefined)).toContain('COMBO_ITEM_STAGE_INVALID');
    });

    it.each([0, 5, -1, 1.5, '3', 'hard', null, true])(
      'rejects %p as a stage',
      (stage) => {
        expect(comboCodes(stage)).toContain('COMBO_ITEM_STAGE_INVALID');
      },
    );

    it('leaves other mechanics alone', () => {
      // An RYO item has no business carrying a Combo stage, and must not be
      // asked for one.
      expect(codes()).not.toContain('COMBO_ITEM_STAGE_INVALID');
    });
  });

  describe('القنبلة content contract', () => {
    // Bomb has no payload of its own: a Bomb item is an ordinary picture question.
    // What it needs is a shape, and it is checked here with the same function the
    // launch path runs, so nothing the form accepts can fail a launch on shape.
    const bombType = () =>
      challengeType({
        id: 'challenge-bomb',
        slug: 'bomb',
        family: ChallengeFamily.COOP,
        answerMode: ChallengeAnswerMode.MATCH,
      });

    const bombItem = (overrides: Record<string, unknown> = {}) =>
      contentItem({
        compatibleChallengeTypeIds: ['challenge-bomb'],
        prompt: { ar: 'من هذا اللاعب؟' },
        media: {
          type: ContentMediaType.IMAGE,
          assets: [{ url: 'https://example.test/a.jpg' }],
        },
        answerPayload: {
          mode: ChallengeAnswerMode.MATCH,
          acceptedAnswers: ['ميسي'],
        },
        status: ContentItemStatus.READY,
        ...overrides,
      });

    const bombCodes = (overrides: Record<string, unknown> = {}) =>
      codes({
        item: bombItem(overrides),
        challengeTypes: typeMap(bombType()),
      });

    it('accepts a picture question with match answers', () => {
      expect(bombCodes()).toEqual([]);
    });

    it('accepts a text-only question with match answers', () => {
      expect(bombCodes({ media: undefined })).toEqual([]);
    });

    it('accepts an audio question with match answers', () => {
      expect(
        bombCodes({
          media: {
            type: ContentMediaType.AUDIO,
            assets: [{ url: '/a.mp3', altText: 'صوت' }],
          },
        }),
      ).toEqual([]);
    });

    it('rejects an image asset with empty URL', () => {
      expect(
        bombCodes({
          media: {
            type: ContentMediaType.IMAGE,
            assets: [{ url: ' ' }],
          },
        }),
      ).toContain('BOMB_ITEM_IMAGE_URL_REQUIRED');
    });

    it('rejects an audio asset with empty URL', () => {
      expect(
        bombCodes({
          media: {
            type: ContentMediaType.AUDIO,
            assets: [{ url: ' ' }],
          },
        }),
      ).toContain('BOMB_ITEM_AUDIO_URL_REQUIRED');
    });

    it('rejects an unsupported media type in Bomb', () => {
      expect(
        bombCodes({
          media: {
            type: ContentMediaType.VIDEO,
            assets: [{ url: '/v.mp4' }],
          },
        }),
      ).toContain('BOMB_ITEM_MEDIA_UNSUPPORTED');
    });

    it('requires an Arabic prompt', () => {
      expect(bombCodes({ prompt: { ar: '   ' } })).toContain(
        'BOMB_ITEM_PROMPT_REQUIRED',
      );
    });

    it('requires at least one accepted answer', () => {
      expect(
        bombCodes({
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: [],
          },
        }),
      ).toContain('BOMB_ITEM_ANSWERS_INVALID');
    });

    it('rejects two spellings that normalize to the same answer', () => {
      expect(
        bombCodes({
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['ميسي', 'ميسي '],
          },
        }),
      ).toContain('BOMB_ITEM_ANSWER_DUPLICATE');
    });

    it('does not impose the run-level count on a single item', () => {
      // 10–15 items is a property of a *challenge*, not of an item. Applying it
      // here would make every Bomb item unauthorable.
      expect(bombCodes()).not.toContain('BOMB_ITEM_COUNT_INVALID');
    });

    it('leaves other mechanics alone', () => {
      // An RYO item has no image and must not be asked for one.
      expect(codes()).not.toContain('BOMB_ITEM_MEDIA_REQUIRED');
    });
  });

  describe('المرحلة content contract', () => {
    // Difficulty is the risk band a team elects before the question is drawn, so
    // an item without one has no pool to be drawn from. It is Marhala's own
    // metadata: never a shared `difficulty`, and never Combo's `comboStage`.
    const marhalaType = () =>
      challengeType({
        id: 'challenge-marhala',
        slug: 'marhala',
        family: ChallengeFamily.SIGNATURE,
        answerMode: ChallengeAnswerMode.MATCH,
      });

    const marhalaItem = (marhalaDifficulty: unknown) =>
      contentItem({
        compatibleChallengeTypeIds: ['challenge-marhala'],
        answerPayload: {
          mode: ChallengeAnswerMode.MATCH,
          acceptedAnswers: ['ماريو'],
        },
        ...(marhalaDifficulty === undefined
          ? {}
          : { mechanicPayload: { marhalaDifficulty } }),
      });

    const marhalaCodes = (marhalaDifficulty: unknown) =>
      codes({
        item: marhalaItem(marhalaDifficulty),
        challengeTypes: typeMap(marhalaType()),
      });

    it.each(['easy', 'medium', 'hard'])('accepts %s', (difficulty) => {
      expect(marhalaCodes(difficulty)).not.toContain(
        'MARHALA_ITEM_DIFFICULTY_INVALID',
      );
    });

    it('rejects an item authored with no difficulty', () => {
      expect(marhalaCodes(undefined)).toContain(
        'MARHALA_ITEM_DIFFICULTY_INVALID',
      );
    });

    // 'سهل' is the label the Admin form shows; the value it must persist is
    // 'easy'. A client that sends the label instead is refused here, so the form's
    // own validation is a convenience rather than the guarantee.
    it.each([
      null,
      '',
      'EASY',
      'Easy',
      'impossible',
      'سهل',
      'متوسط',
      'صعب',
      1,
      0,
      true,
      {},
      ['hard'],
    ])('rejects %p as a difficulty', (difficulty) => {
      expect(marhalaCodes(difficulty)).toContain(
        'MARHALA_ITEM_DIFFICULTY_INVALID',
      );
    });

    it('does not accept a Combo stage in its place', () => {
      // The two are different concepts; sharing the field would let one
      // mechanic's rebalance change the other's gameplay.
      expect(
        codes({
          item: contentItem({
            compatibleChallengeTypeIds: ['challenge-marhala'],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: ['ماريو'],
            },
            mechanicPayload: { comboStage: 2 },
          }),
          challengeTypes: typeMap(marhalaType()),
        }),
      ).toContain('MARHALA_ITEM_DIFFICULTY_INVALID');
    });

    it('leaves other mechanics alone', () => {
      expect(codes()).not.toContain('MARHALA_ITEM_DIFFICULTY_INVALID');
    });
  });
});
