import { CandidateCompatibilityService } from './candidate-compatibility.service';
import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import {
  challengeType,
  scope,
} from '../../world-content/domain/world-content.fixtures';
import { ContentItemView } from '../../world-content/domain/world-content.types';

/**
 * The last mile: can a candidate a human approves actually be published?
 *
 * The engine evaluates its candidates at DRAFT and deliberately defers the
 * READY decision (`READY_VALIDATION_PENDING` in
 * `candidate-compatibility.service.ts`). The pilot end-to-end asserts the
 * opposite of publication — "created no ContentItem, promoted nothing to
 * READY" — so no test proves the deferred decision would succeed. Roadmap
 * §30.3 Phase 1 records the same gap: "READY never exercised".
 *
 * These tests close it at the gate that actually decides it: the canonical
 * `ContentItemCompatibilityPolicy`, run on the item the engine would create,
 * at the status it has to survive.
 */
describe('Engine draft → READY publication gate (roadmap §30.3 Phase 1)', () => {
  const policy = new ContentItemCompatibilityPolicy();
  const compatibility = new CandidateCompatibilityService(policy);

  // The shape the engine persists on a candidate, as the review service's own
  // fixtures record it: an Arabic prompt plus a multiple-choice payload.
  const engineDraft = {
    prompt: { ar: 'أي نادٍ أنهى سلسلة أرسنال بدون هزيمة؟' },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'manchester-united', label: { ar: 'مانشستر يونايتد' } },
        { id: 'chelsea', label: { ar: 'تشيلسي' } },
        { id: 'liverpool', label: { ar: 'ليفربول' } },
      ],
      correctOptionId: 'manchester-united',
    },
  } as Record<string, unknown>;

  // Production references for the pending Premier League / RYO candidates.
  const premierLeague = scope({
    id: 'scope-premier-league',
    slug: 'premier-league',
    name: 'Premier League',
    status: WorldContentStatus.ACTIVE,
  });
  const ryo = challengeType({
    id: 'challenge-ryo',
    slug: 'read-your-opponent',
    status: WorldContentStatus.ACTIVE,
  });

  /** The ContentItem `canonicalDto` builds, at the status under test. */
  const canonicalItem = (
    status: ContentItemStatus,
    overrides: Partial<ContentItemView> = {},
  ): ContentItemView => ({
    id: 'engine-draft',
    scopeId: premierLeague.id,
    worldId: premierLeague.worldId,
    prompt: engineDraft.prompt as ContentItemView['prompt'],
    compatibleChallengeTypeIds: [ryo.id],
    answerPayload:
      engineDraft.answerPayload as ContentItemView['answerPayload'],
    isReusableAcrossSessions: false,
    status,
    ...overrides,
  });

  const readyBlockers = (overrides: Partial<ContentItemView> = {}) =>
    policy
      .evaluate({
        item: canonicalItem(ContentItemStatus.READY, overrides),
        scope: premierLeague,
        worldStatus: WorldContentStatus.ACTIVE,
        challengeTypes: new Map([[ryo.id, ryo]]),
      })
      .blockers.map((problem) => problem.code);

  it('clears the engine pre-draft gate', () => {
    const evaluation = compatibility.evaluate({
      mechanicKey: 'read-your-opponent',
      draft: engineDraft,
      references: {
        scope: premierLeague,
        worldStatus: WorldContentStatus.ACTIVE,
        challengeType: ryo,
      },
    });
    expect(evaluation.preDraft.blockers).toEqual([]);
  });

  it('defers the READY decision rather than making it', () => {
    // Documents why this file exists: approval alone proves nothing about
    // publication, because the engine never evaluates that transition.
    const evaluation = compatibility.evaluate({
      mechanicKey: 'read-your-opponent',
      draft: engineDraft,
      references: {
        scope: premierLeague,
        worldStatus: WorldContentStatus.ACTIVE,
        challengeType: ryo,
      },
    });
    expect(evaluation.deferredChecks.map((check) => check.code)).toContain(
      'READY_VALIDATION_PENDING',
    );
  });

  it('reaches READY with no blockers — the deferred decision succeeds', () => {
    expect(readyBlockers()).toEqual([]);
  });

  it('still refuses an item the gate should refuse', () => {
    // Negative control. Without it, an empty blocker list above could mean the
    // fixtures miss the gate rather than that the item passes it.
    expect(readyBlockers({ compatibleChallengeTypeIds: [] })).toContain(
      'CONTENT_WITHOUT_COMPATIBLE_CHALLENGE_TYPE',
    );
  });

  describe("مين أقرب (Closest), the engine's other text mechanic", () => {
    // The generator authors no tolerance — the Closest runtime grades
    // nearest-wins — and carries the slider in mechanicPayload.
    const closestDraft = {
      prompt: { ar: 'كم هدفًا سجل هالاند في أول موسم له بالدوري الإنجليزي؟' },
      answerPayload: { mode: 'closest', correctValue: 36 },
      mechanicPayload: {
        closestSlider: { mode: 'numeric-range', min: 10, max: 50, step: 1 },
      },
    } as Record<string, unknown>;
    const closest = challengeType({
      id: 'challenge-closest',
      slug: 'closest',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.CLOSEST,
      status: WorldContentStatus.ACTIVE,
    });

    const evaluateClosest = (item: Partial<ContentItemView> = {}) =>
      policy
        .evaluate({
          item: {
            id: 'engine-draft-closest',
            scopeId: premierLeague.id,
            worldId: premierLeague.worldId,
            prompt: closestDraft.prompt as ContentItemView['prompt'],
            compatibleChallengeTypeIds: [closest.id],
            answerPayload:
              closestDraft.answerPayload as ContentItemView['answerPayload'],
            mechanicPayload:
              closestDraft.mechanicPayload as ContentItemView['mechanicPayload'],
            isReusableAcrossSessions: false,
            status: ContentItemStatus.READY,
            ...item,
          },
          scope: premierLeague,
          worldStatus: WorldContentStatus.ACTIVE,
          challengeTypes: new Map([[closest.id, closest]]),
          authoring: { isNewItem: true },
        })
        .blockers.map((problem) => problem.code);

    it('reaches READY with the slider the generator authors', () => {
      expect(evaluateClosest()).toEqual([]);
    });

    it('is refused without that slider — the generator must author it', () => {
      expect(evaluateClosest({ mechanicPayload: undefined })).toContain(
        'CLOSEST_SLIDER_MODE_REQUIRED',
      );
    });
  });
});
