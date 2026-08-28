import { ContentItemCompatibilityPolicy } from './content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  ContentMediaType,
  DISTRIBUTED_INFORMATION_SLUG,
  DISTRIBUTED_INFORMATION_TIMER_SECONDS,
  DISTRIBUTED_INFORMATION_VARIANT,
  WorldContentStatus,
} from './world-content.constants';
import { challengeType, presentation, scope } from './world-content.fixtures';
import type {
  ContentItemView,
  DistributedInformationPayload,
} from './world-content.types';

/**
 * The machine-checkable half of the "ركّبها" safety contract. Whether a split is
 * genuinely unsolvable alone is the author's judgement, recorded as a
 * confirmation; everything structural is asserted here.
 */
describe('distributed-information content validation', () => {
  const policy = new ContentItemCompatibilityPolicy();

  const mechanic = challengeType({
    id: 'challenge-distributed',
    slug: DISTRIBUTED_INFORMATION_SLUG,
    family: ChallengeFamily.COOP,
    answerMode: ChallengeAnswerMode.MATCH,
    defaultPresentation: presentation({
      inputType: 'phone-text',
      timerSeconds: DISTRIBUTED_INFORMATION_TIMER_SECONDS,
    }),
  });

  const payload = (
    overrides: Partial<DistributedInformationPayload> = {},
  ): DistributedInformationPayload => ({
    variant: DISTRIBUTED_INFORMATION_VARIANT,
    publicPrompt: { ar: 'من هو اللاعب؟' },
    segments: [
      { id: 'A', content: { ar: 'لعب في نادٍ إسباني' } },
      { id: 'B', content: { ar: 'فاز بالكرة الذهبية مرة واحدة' } },
      { id: 'C', content: { ar: 'اعتزل عام 2019' } },
    ],
    twoPlayerMergeOptions: [
      {
        firstParticipantSegmentIds: ['A', 'C'],
        secondParticipantSegmentIds: ['B'],
      },
    ],
    supportedTeamSizes: [2, 3],
    authorSafetyConfirmation: true,
    ...overrides,
  });

  const item = (
    overrides: Partial<ContentItemView> = {},
    mechanicPayload: Partial<DistributedInformationPayload> = {},
  ): ContentItemView =>
    ({
      id: 'item-1',
      scopeId: 'scope-1',
      worldId: 'world-1',
      prompt: { ar: 'من هو اللاعب؟' },
      compatibleChallengeTypeIds: [mechanic.id],
      answerPayload: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: ['ميسي'],
      },
      mechanicPayload: payload(mechanicPayload),
      isReusableAcrossSessions: false,
      status: ContentItemStatus.READY,
      ...overrides,
    }) as ContentItemView;

  const codes = (
    overrides: Partial<ContentItemView> = {},
    mechanicPayload: Partial<DistributedInformationPayload> = {},
  ) =>
    policy
      .evaluate({
        item: item(overrides, mechanicPayload),
        scope: scope({
          id: 'scope-1',
          worldId: 'world-1',
          status: WorldContentStatus.ACTIVE,
        }),
        challengeTypes: new Map([[mechanic.id, mechanic]]),
      })
      .blockers.map((problem) => problem.code);

  it('accepts a complete three-segment item', () => {
    expect(codes()).toEqual([]);
  });

  it('requires the public prompt every teammate reads', () => {
    expect(codes({}, { publicPrompt: { ar: '  ' } })).toContain(
      'DISTRIBUTED_PUBLIC_PROMPT_REQUIRED',
    );
  });

  it('requires exactly three segments', () => {
    expect(
      codes(
        {},
        {
          segments: [
            { id: 'A', content: { ar: 'أ' } },
            { id: 'B', content: { ar: 'ب' } },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_SEGMENT_COUNT_INVALID');
  });

  it('refuses a duplicated or unknown segment id', () => {
    expect(
      codes(
        {},
        {
          segments: [
            { id: 'A', content: { ar: 'أ' } },
            { id: 'A', content: { ar: 'أ مكررة' } },
            { id: 'C', content: { ar: 'ج' } },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_SEGMENT_IDS_INVALID');
    expect(
      codes(
        {},
        {
          segments: [
            { id: 'A', content: { ar: 'أ' } },
            { id: 'B', content: { ar: 'ب' } },
            { id: 'D' as never, content: { ar: 'د' } },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_SEGMENT_IDS_INVALID');
  });

  it('requires content in every segment', () => {
    expect(
      codes(
        {},
        {
          segments: [
            { id: 'A', content: { ar: 'أ' } },
            { id: 'B', content: { ar: '' } },
            { id: 'C', content: { ar: 'ج' } },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_SEGMENT_CONTENT_REQUIRED');
  });

  it('requires at least one safe two-player split', () => {
    expect(codes({}, { twoPlayerMergeOptions: [] })).toContain(
      'DISTRIBUTED_MERGE_OPTION_REQUIRED',
    );
  });

  it('accepts each of the three canonical splits', () => {
    for (const merge of [
      {
        firstParticipantSegmentIds: ['A', 'B'],
        secondParticipantSegmentIds: ['C'],
      },
      {
        firstParticipantSegmentIds: ['A', 'C'],
        secondParticipantSegmentIds: ['B'],
      },
      {
        firstParticipantSegmentIds: ['B', 'C'],
        secondParticipantSegmentIds: ['A'],
      },
    ] as DistributedInformationPayload['twoPlayerMergeOptions']) {
      expect(codes({}, { twoPlayerMergeOptions: [merge] })).toEqual([]);
    }
  });

  it('refuses a split that does not cover every segment exactly once', () => {
    // A segment nobody reads.
    expect(
      codes(
        {},
        {
          twoPlayerMergeOptions: [
            {
              firstParticipantSegmentIds: ['A'],
              secondParticipantSegmentIds: ['B'],
            },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_MERGE_OPTION_INVALID');

    // A segment read twice.
    expect(
      codes(
        {},
        {
          twoPlayerMergeOptions: [
            {
              firstParticipantSegmentIds: ['A', 'B'],
              secondParticipantSegmentIds: ['B'],
            },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_MERGE_OPTION_INVALID');

    // One player holding all three is the leak this rule exists to stop.
    expect(
      codes(
        {},
        {
          twoPlayerMergeOptions: [
            {
              firstParticipantSegmentIds: ['A', 'B', 'C'],
              secondParticipantSegmentIds: [],
            },
          ],
        },
      ),
    ).toContain('DISTRIBUTED_MERGE_OPTION_INVALID');
  });

  it('supports exactly two and three player teams', () => {
    for (const supportedTeamSizes of [[2], [3], [2, 3, 4], [1, 2, 3]]) {
      expect(codes({}, { supportedTeamSizes })).toContain(
        'DISTRIBUTED_TEAM_SIZES_INVALID',
      );
    }
    expect(codes({}, { supportedTeamSizes: [3, 2] })).toEqual([]);
  });

  it('accepts only machine-resolvable answer modes', () => {
    for (const mode of [
      ChallengeAnswerMode.MATCH,
      ChallengeAnswerMode.CLOSEST,
      ChallengeAnswerMode.MULTIPLE_CHOICE,
    ]) {
      const answerPayload =
        mode === ChallengeAnswerMode.CLOSEST
          ? { mode, correctValue: 7 }
          : mode === ChallengeAnswerMode.MULTIPLE_CHOICE
            ? {
                mode,
                options: [
                  { id: 'a', label: { ar: 'أ' } },
                  { id: 'b', label: { ar: 'ب' } },
                ],
                correctOptionId: 'a',
              }
            : { mode, acceptedAnswers: ['ميسي'] };
      expect(
        codes({ answerPayload } as Partial<ContentItemView>),
      ).not.toContain('DISTRIBUTED_ANSWER_MODE_UNSUPPORTED');
    }

    expect(
      codes({
        answerPayload: {
          mode: ChallengeAnswerMode.VOTE,
          consensusRule: 'majority',
        },
      } as Partial<ContentItemView>),
    ).toContain('DISTRIBUTED_ANSWER_MODE_UNSUPPORTED');
  });

  it('requires the author safety confirmation before the item is ready', () => {
    expect(codes({}, { authorSafetyConfirmation: false })).toContain(
      'DISTRIBUTED_SAFETY_CONFIRMATION_REQUIRED',
    );
    // A draft may still be mid-authoring.
    expect(
      codes(
        { status: ContentItemStatus.DRAFT },
        { authorSafetyConfirmation: false },
      ),
    ).not.toContain('DISTRIBUTED_SAFETY_CONFIRMATION_REQUIRED');
  });

  it('ignores items that are not distributed-information content', () => {
    expect(
      codes({ mechanicPayload: undefined } as Partial<ContentItemView>),
    ).toEqual([]);
  });

  describe('rich private views (V1)', () => {
    // A legacy text-only item is exactly the base fixture: it must stay valid.
    it('keeps a legacy text-only item valid', () => {
      expect(codes()).toEqual([]);
    });

    it('accepts a per-segment image and audio', () => {
      expect(
        codes(
          {},
          {
            segments: [
              {
                id: 'A',
                content: { ar: 'الجزء أ' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/a.png' }],
                },
              },
              {
                id: 'B',
                content: { ar: 'الجزء ب' },
                media: {
                  type: ContentMediaType.AUDIO,
                  assets: [{ url: 'https://x.invalid/b.mp3' }],
                },
              },
              { id: 'C', content: { ar: 'الجزء ج' } },
            ],
          },
        ),
      ).toEqual([]);
    });

    it('rejects a segment media with an unsupported modality', () => {
      expect(
        codes(
          {},
          {
            segments: [
              {
                id: 'A',
                content: { ar: 'الجزء أ' },
                media: {
                  type: 'gif' as never,
                  assets: [{ url: 'https://x.invalid/a.gif' }],
                },
              },
              { id: 'B', content: { ar: 'الجزء ب' } },
              { id: 'C', content: { ar: 'الجزء ج' } },
            ],
          },
        ),
      ).toContain('INVALID_CONTENT_MEDIA_TYPE');
    });

    it('rejects a segment media asset with no URL', () => {
      expect(
        codes(
          {},
          {
            segments: [
              {
                id: 'A',
                content: { ar: 'الجزء أ' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: '  ' }],
                },
              },
              { id: 'B', content: { ar: 'الجزء ب' } },
              { id: 'C', content: { ar: 'الجزء ج' } },
            ],
          },
        ),
      ).toContain('CONTENT_MEDIA_ASSET_URL_REQUIRED');
    });

    // The three representative V1 families, encoded honestly against the current
    // schema: shared media is the item's global media, private views are segment
    // text/media, and the final answer stays in answerPayload.
    it('A. missing-piece: global image board + private images + a selection answer', () => {
      expect(
        codes(
          {
            media: {
              type: ContentMediaType.IMAGE,
              assets: [{ url: 'https://x.invalid/board-6-pieces.png' }],
            },
            // The final "select candidate #4" resolves through the existing match
            // answer (a multiple_choice challenge type would resolve it identically).
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: ['4'],
            },
          } as Partial<ContentItemView>,
          {
            publicPrompt: { ar: 'أي قطعة تكمل الشكل؟' },
            segments: [
              {
                id: 'A',
                content: { ar: 'الشكل الناقص' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/partial.png' }],
                },
              },
              {
                id: 'B',
                content: { ar: 'مرشحتان' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/candidates-b.png' }],
                },
              },
              {
                id: 'C',
                content: { ar: 'مرشحة مضللة وأخرى صحيحة' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/candidates-c.png' }],
                },
              },
            ],
          },
        ),
      ).toEqual([]);
    });

    it('B. conditional-wire: two text rules + a private device image + a selection answer', () => {
      expect(
        codes(
          {
            // "Cut which wire?" resolves through the existing match answer.
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: ['الأحمر'],
            },
          } as Partial<ContentItemView>,
          {
            publicPrompt: { ar: 'أي سلك نقطع؟' },
            segments: [
              { id: 'A', content: { ar: 'إن كان الأسود خاطئًا فاقطع الأحمر' } },
              {
                id: 'B',
                content: { ar: 'إن كان الرقم أكبر من ٦ فاقطع الأبيض' },
              },
              {
                id: 'C',
                content: { ar: 'حالة الجهاز' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/device-state.png' }],
                },
              },
            ],
          },
        ),
      ).toEqual([]);
    });

    it('C. distributed construction: private text/image fragments + a match answer', () => {
      expect(
        codes(
          {
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: ['الرياض'],
            },
          } as Partial<ContentItemView>,
          {
            publicPrompt: { ar: 'ركّبوا اسم المدينة' },
            segments: [
              { id: 'A', content: { ar: 'الحرف الأول: ا' } },
              {
                id: 'B',
                content: { ar: 'الحرفان التاليان' },
                media: {
                  type: ContentMediaType.IMAGE,
                  assets: [{ url: 'https://x.invalid/fragment-ريا.png' }],
                },
              },
              { id: 'C', content: { ar: 'الحرفان الأخيران: ض + —' } },
            ],
          },
        ),
      ).toEqual([]);
    });
  });
});
