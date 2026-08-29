import { ContentItemCompatibilityPolicy } from './content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  ContentMediaType,
  RAKKIBHA_SLUG,
  RAKKIBHA_VARIANT,
  WorldContentStatus,
} from './world-content.constants';
import { challengeType, presentation, scope } from './world-content.fixtures';
import type { ContentItemView, RakkibhaPayload } from './world-content.types';

/**
 * The machine-checkable half of the "ركّبها" visual-assembly contract: one private
 * reference view, two-or-three candidate views, and exactly one candidate globally
 * that matches the correct canonical identity. Whether a piece is genuinely the
 * only fit is the author's judgement, recorded as a confirmation; everything
 * structural is asserted here.
 */
describe('rakkibha content validation', () => {
  const policy = new ContentItemCompatibilityPolicy();

  const mechanic = challengeType({
    id: 'challenge-rakkibha',
    slug: RAKKIBHA_SLUG,
    family: ChallengeFamily.COOP,
    answerMode: ChallengeAnswerMode.MATCH,
    defaultPresentation: presentation({ inputType: 'phone-text' }),
  });

  const image = (url: string) => ({
    type: ContentMediaType.IMAGE,
    assets: [{ url }],
  });

  const payload = (
    overrides: Partial<RakkibhaPayload> = {},
  ): RakkibhaPayload => ({
    variant: RAKKIBHA_VARIANT,
    family: RAKKIBHA_VARIANT,
    instruction: { ar: 'صفوا الشكل ثم اختاروا القطعة المطابقة' },
    reference: { media: image('/reference.png') },
    candidateViews: [
      {
        id: 'true-view',
        candidates: [
          {
            localId: 'one',
            canonicalIdentity: 'match',
            media: image('/t1.png'),
          },
          {
            localId: 'two',
            canonicalIdentity: 'wrong-1',
            media: image('/t2.png'),
          },
        ],
      },
      {
        id: 'distractor-view',
        candidates: [
          {
            localId: 'one',
            canonicalIdentity: 'wrong-2',
            media: image('/d1.png'),
          },
          {
            localId: 'two',
            canonicalIdentity: 'wrong-3',
            media: image('/d2.png'),
          },
        ],
      },
    ],
    correctCanonicalIdentity: 'match',
    supportedTeamSizes: [2, 3],
    authorSafetyConfirmation: true,
    ...overrides,
  });

  const item = (
    overrides: Partial<ContentItemView> = {},
    mechanicPayload: Partial<RakkibhaPayload> = {},
  ): ContentItemView =>
    ({
      id: 'item-1',
      scopeId: 'scope-1',
      worldId: 'world-1',
      prompt: { ar: 'أي قطعة تكمل الشكل؟' },
      compatibleChallengeTypeIds: [mechanic.id],
      answerPayload: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: ['x'],
      },
      mechanicPayload: payload(mechanicPayload),
      isReusableAcrossSessions: false,
      status: ContentItemStatus.READY,
      ...overrides,
    }) as ContentItemView;

  const codes = (
    overrides: Partial<ContentItemView> = {},
    mechanicPayload: Partial<RakkibhaPayload> = {},
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

  it('accepts a complete visual-assembly item', () => {
    expect(codes()).toEqual([]);
  });

  it('requires the visual-assembly structure when the mechanic is rakkibha', () => {
    // A challenge whose answer mode IS rakkibha demands the visual-assembly payload;
    // a legacy three-segment shape no longer satisfies it.
    const rakkibhaMechanic = challengeType({
      id: 'challenge-rakkibha',
      slug: RAKKIBHA_SLUG,
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.RAKKIBHA,
      defaultPresentation: presentation({ inputType: 'phone-text' }),
    });
    const blockers = policy
      .evaluate({
        item: {
          ...item(),
          compatibleChallengeTypeIds: [rakkibhaMechanic.id],
          mechanicPayload: { variant: 'three-segment-race' } as never,
        },
        scope: scope({
          id: 'scope-1',
          worldId: 'world-1',
          status: WorldContentStatus.ACTIVE,
        }),
        challengeTypes: new Map([[rakkibhaMechanic.id, rakkibhaMechanic]]),
      })
      .blockers.map((problem) => problem.code);
    expect(blockers).toContain('RAKKIBHA_STRUCTURE_REQUIRED');
  });

  it('requires an instruction every teammate can read', () => {
    expect(codes({}, { instruction: { ar: '  ' } })).toContain(
      'RAKKIBHA_INSTRUCTION_REQUIRED',
    );
  });

  it('requires reference media', () => {
    expect(
      codes(
        {},
        { reference: { media: { type: ContentMediaType.IMAGE, assets: [] } } },
      ),
    ).toContain('CONTENT_MEDIA_ASSETS_REQUIRED');
  });

  it('requires at least two candidate views', () => {
    expect(
      codes({}, { candidateViews: [payload().candidateViews[0]] }),
    ).toContain('RAKKIBHA_CANDIDATE_VIEWS_REQUIRED');
  });

  it('rejects duplicate candidate-view ids', () => {
    const view = payload().candidateViews[0];
    expect(codes({}, { candidateViews: [view, view] })).toContain(
      'RAKKIBHA_CANDIDATE_VIEW_IDS_INVALID',
    );
  });

  it('rejects a view with fewer than two or more than three candidates', () => {
    const base = payload();
    expect(
      codes(
        {},
        {
          candidateViews: [
            {
              id: 'true-view',
              candidates: [base.candidateViews[0].candidates[0]],
            },
            base.candidateViews[1],
          ],
        },
      ),
    ).toContain('RAKKIBHA_CANDIDATE_COUNT_INVALID');
  });

  it('rejects duplicate local candidate ids inside one view', () => {
    expect(
      codes(
        {},
        {
          candidateViews: [
            {
              id: 'true-view',
              candidates: [
                {
                  localId: 'one',
                  canonicalIdentity: 'match',
                  media: image('/a.png'),
                },
                {
                  localId: 'one',
                  canonicalIdentity: 'wrong-1',
                  media: image('/b.png'),
                },
              ],
            },
            payload().candidateViews[1],
          ],
        },
      ),
    ).toContain('RAKKIBHA_LOCAL_IDS_INVALID');
  });

  it('requires a server-side canonical identity on every candidate', () => {
    const bad = payload();
    bad.candidateViews[0].candidates[1].canonicalIdentity = '  ';
    expect(codes({}, { candidateViews: bad.candidateViews })).toContain(
      'RAKKIBHA_CANONICAL_IDENTITY_REQUIRED',
    );
  });

  it('requires exactly one globally-correct candidate', () => {
    // Zero matches.
    expect(codes({}, { correctCanonicalIdentity: 'nobody' })).toContain(
      'RAKKIBHA_TRUE_CANDIDATE_INVALID',
    );
    // Two matches.
    const twoTrue = payload();
    twoTrue.candidateViews[1].candidates[0].canonicalIdentity = 'match';
    expect(codes({}, { candidateViews: twoTrue.candidateViews })).toContain(
      'RAKKIBHA_TRUE_CANDIDATE_INVALID',
    );
  });

  it('supports exactly two and three player teams', () => {
    for (const supportedTeamSizes of [[2], [3], [2, 3, 4]]) {
      expect(codes({}, { supportedTeamSizes })).toContain(
        'RAKKIBHA_TEAM_SIZES_INVALID',
      );
    }
    expect(codes({}, { supportedTeamSizes: [2, 3] })).toEqual([]);
  });

  it('rejects invalid candidate media', () => {
    const bad = payload();
    bad.candidateViews[0].candidates[0].media = {
      type: 'gif' as never,
      assets: [{ url: '/x.gif' }],
    };
    expect(codes({}, { candidateViews: bad.candidateViews })).toContain(
      'INVALID_CONTENT_MEDIA_TYPE',
    );
  });

  it('requires the author safety confirmation before the item is ready', () => {
    expect(codes({}, { authorSafetyConfirmation: false })).toContain(
      'RAKKIBHA_SAFETY_CONFIRMATION_REQUIRED',
    );
    // A draft may still be mid-authoring.
    expect(
      codes(
        { status: ContentItemStatus.DRAFT },
        { authorSafetyConfirmation: false },
      ),
    ).not.toContain('RAKKIBHA_SAFETY_CONFIRMATION_REQUIRED');
  });

  it('ignores items that are not rakkibha content', () => {
    expect(
      codes({ mechanicPayload: undefined } as Partial<ContentItemView>),
    ).toEqual([]);
  });
});
