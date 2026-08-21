import {
  COMBO_ITEM_COUNT,
  ComboCandidateItem,
  buildComboQuestionPlan,
} from './combo-content.policy';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
} from './world-content.constants';

/**
 * Combo's content contract.
 *
 * The stage is the load-bearing part: the mechanic's whole tension comes from
 * questions getting harder as the unbanked balance grows, so a plan that cannot
 * prove its progression is worse than no plan. These hold the policy to that,
 * and to being deterministic — a reconnecting client must be handed the question
 * it left rather than a freshly rolled one.
 */

const WORLD = 'world-anime';

function item(
  overrides: Partial<ComboCandidateItem> & { id: string; stage?: number },
): ComboCandidateItem {
  const { stage, ...rest } = overrides;
  return {
    status: ContentItemStatus.READY,
    worldId: WORLD,
    scopeId: 'scope-naruto',
    prompt: { ar: 'سؤال' },
    answerMode: ChallengeAnswerMode.MATCH,
    acceptedAnswers: ['ناروتو'],
    ...(stage === undefined ? {} : { mechanicPayload: { comboStage: stage } }),
    ...rest,
  } as ComboCandidateItem;
}

/** Two items at each stage, spread across four Scopes as the selector would. */
const selection = (): ComboCandidateItem[] =>
  [1, 2, 3, 4].flatMap((stage) => [
    item({ id: `a-${stage}`, stage, scopeId: `scope-${stage}` }),
    item({ id: `b-${stage}`, stage, scopeId: `scope-${stage}` }),
  ]);

describe('Combo content plan', () => {
  it('builds two runs of four rising stages', () => {
    const plan = buildComboQuestionPlan(selection(), { worldId: WORLD });

    expect(plan).toHaveLength(2);
    for (const run of plan) {
      expect(run.map((question) => question.stage)).toEqual([1, 2, 3, 4]);
    }
  });

  it('gives every question to exactly one run', () => {
    const plan = buildComboQuestionPlan(selection(), { worldId: WORLD });

    const ids = plan.flat().map((question) => question.contentItemId);
    expect(new Set(ids).size).toBe(COMBO_ITEM_COUNT);
  });

  it('is deterministic — the same selection always yields the same plan', () => {
    const first = buildComboQuestionPlan(selection(), { worldId: WORLD });
    const second = buildComboQuestionPlan(selection(), { worldId: WORLD });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('spreads Scopes inside a run when the selection allows it', () => {
    const plan = buildComboQuestionPlan(selection(), { worldId: WORLD });

    for (const run of plan) {
      const scopes = run.map((question) => question.scopeId);
      expect(new Set(scopes).size).toBe(4);
    }
  });

  it('prefers an unused Scope without ever reordering the stages', () => {
    // Stage 2 offers a repeat of run 0's stage-1 Scope and a fresh one.
    const skewed = [
      item({ id: 'a-1', stage: 1, scopeId: 'scope-x' }),
      item({ id: 'b-1', stage: 1, scopeId: 'scope-y' }),
      item({ id: 'a-2', stage: 2, scopeId: 'scope-x' }),
      item({ id: 'b-2', stage: 2, scopeId: 'scope-z' }),
      item({ id: 'a-3', stage: 3, scopeId: 'scope-p' }),
      item({ id: 'b-3', stage: 3, scopeId: 'scope-q' }),
      item({ id: 'a-4', stage: 4, scopeId: 'scope-r' }),
      item({ id: 'b-4', stage: 4, scopeId: 'scope-s' }),
    ];

    const plan = buildComboQuestionPlan(skewed, { worldId: WORLD });

    expect(plan[0].map((q) => q.stage)).toEqual([1, 2, 3, 4]);
    // Run 0 took scope-x at stage 1, so stage 2 hands it the fresh Scope.
    expect(plan[0][1].scopeId).toBe('scope-z');
    expect(plan[1][1].scopeId).toBe('scope-x');
  });

  it('never leaks the authored answers into the stage assignment', () => {
    const plan = buildComboQuestionPlan(selection(), { worldId: WORLD });

    // The plan carries them because the runtime grades with them; the *runtime*
    // is what withholds them from clients.
    expect(plan[0][0].acceptedAnswers).toEqual(['ناروتو']);
  });

  it('normalizes and de-duplicates accepted answers once', () => {
    const items = selection();
    items[0] = item({
      id: items[0].id,
      stage: 1,
      scopeId: 'scope-1',
      acceptedAnswers: ['ناروتو', 'ناروتو ', 'Naruto'],
    });

    const plan = buildComboQuestionPlan(items, { worldId: WORLD });
    const first = plan
      .flat()
      .find((question) => question.contentItemId === items[0].id)!;

    expect(first.acceptedAnswers).toHaveLength(2);
  });
});

describe('Combo content rejections', () => {
  const expectReject = (items: ComboCandidateItem[], pattern: RegExp) =>
    expect(() => buildComboQuestionPlan(items, { worldId: WORLD })).toThrow(
      pattern,
    );

  it('refuses a selection that is not exactly eight items', () => {
    expectReject(selection().slice(0, 7), /exactly 8 distinct items/);
  });

  it('refuses duplicate items', () => {
    const items = selection();
    items[7] = { ...items[0] };
    expectReject(items, /exactly 8 distinct items/);
  });

  it('refuses an item with no authored stage', () => {
    const items = selection();
    items[3] = item({ id: 'no-stage', scopeId: 'scope-2' });
    expectReject(items, /comboStage of 1, 2, 3 or 4/);
  });

  it('refuses a stage outside the four-stage progression', () => {
    const items = selection();
    items[3] = item({ id: 'bad-stage', stage: 5, scopeId: 'scope-2' });
    expectReject(items, /comboStage of 1, 2, 3 or 4/);
  });

  it('refuses lopsided stage coverage', () => {
    // Three at stage 1, one at stage 2 — no second run is playable.
    const items = selection();
    items[2] = item({ id: 'extra-1', stage: 1, scopeId: 'scope-2' });
    expectReject(items, /exactly 2 items at stage/);
  });

  it('refuses an answer mode Combo cannot grade', () => {
    const items = selection();
    items[0] = item({
      id: items[0].id,
      stage: 1,
      scopeId: 'scope-1',
      answerMode: ChallengeAnswerMode.CLOSEST,
    });
    expectReject(items, /Combo grades typed text/);
  });

  it('refuses an item with no accepted answers', () => {
    const items = selection();
    items[0] = item({
      id: items[0].id,
      stage: 1,
      scopeId: 'scope-1',
      acceptedAnswers: [],
    });
    expectReject(items, /1–10 accepted answers/);
  });

  it('refuses content that is not ready', () => {
    const items = selection();
    items[0] = item({
      id: items[0].id,
      stage: 1,
      scopeId: 'scope-1',
      status: ContentItemStatus.DRAFT,
    });
    expectReject(items, /not ready/);
  });

  it('refuses content from another World', () => {
    const items = selection();
    items[0] = item({
      id: items[0].id,
      stage: 1,
      scopeId: 'scope-1',
      worldId: 'world-football',
    });
    expectReject(items, /another World/);
  });
});
