import { ContentItemCompatibilityPolicy } from './content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
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
});
