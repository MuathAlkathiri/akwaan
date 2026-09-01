import {
  LAQATHA_GAMEPLAY_PLUGIN,
  LAQATHA_VALUES,
  LaqathaRuntimeClue,
  LaqathaRuntimeQuestion,
  validateLaqathaQuestion,
} from './laqatha-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import { ContentMediaType } from '../../world-content/domain/world-content.constants';

const clue = (
  order: number,
  overrides: Partial<LaqathaRuntimeClue> = {},
): LaqathaRuntimeClue => ({
  order,
  value: LAQATHA_VALUES[order - 1],
  text: { ar: `دليل ${order}` },
  ...overrides,
});

const question = (id: string): LaqathaRuntimeQuestion => ({
  contentItemId: id,
  title: 'الأسد الملك',
  prompt: { ar: 'خمّن الفيلم' },
  clues: [1, 2, 3, 4, 5].map((order) => clue(order)),
  acceptedAnswers: ['الأسد الملك', 'the lion king'],
});

const initial = (): GameplayModeState => ({
  challengeId: 'c',
  worldId: 'w',
  slotKey: 'slot_1',
  questionsJson: JSON.stringify([
    question('q1'),
    question('q2'),
    question('q3'),
  ]),
  teamIdsJson: JSON.stringify(['t1', 't2']),
  currentQuestionIndex: 0,
  revealedClueCount: 1,
  phase: 'preparing',
  claimOwnerTeamId: null,
  frozenReward: null,
  revealRemainingMs: null,
  failedTeamIdsJson: '[]',
  resultsJson: '[]',
  deadlineAt: null,
});

const context = (
  participantId: string,
  now = new Date('2026-01-01T00:00:00Z'),
) => ({
  sessionId: 's',
  runtimeId: 'r',
  submitterParticipantId: participantId,
  now,
  eligibleParticipants: [
    { participantId: 'p1', teamId: 't1', connected: true },
    { participantId: 'p1b', teamId: 't1', connected: true },
    { participantId: 'p2', teamId: 't2', connected: true },
  ],
});

const run = (
  state: GameplayModeState,
  type: string,
  participantId = 'p1',
  payload: Record<string, unknown> = {},
  now = new Date('2026-01-01T00:00:00Z'),
) =>
  LAQATHA_GAMEPLAY_PLUGIN.handleCommand(context(participantId, now), {
    type,
    payload: payload as GameplayModeState,
    runtimeState: state,
    roundState: {
      phase: state.phase,
      questionIndex: state.currentQuestionIndex,
    },
  });

/** A live `revealing` state: `count` clues shown, next reveal at `deadlineAt`. */
const revealing = (
  count: number,
  deadlineAt = '2026-01-01T00:00:03.000Z',
): GameplayModeState => ({
  ...initial(),
  phase: 'revealing',
  revealedClueCount: count,
  deadlineAt,
});

const project = (state: GameplayModeState) =>
  LAQATHA_GAMEPLAY_PLUGIN.projectRuntimeState(state);

describe('القطها content validation', () => {
  it('accepts exactly five ordered clues valued 5..1 with accepted answers', () => {
    expect(validateLaqathaQuestion(question('q'))).toBeDefined();
  });

  it('rejects fewer than five clues', () => {
    expect(() =>
      validateLaqathaQuestion({
        ...question('q'),
        clues: [1, 2, 3, 4].map((o) => clue(o)),
      }),
    ).toThrow();
  });

  it('rejects more than five clues', () => {
    expect(() =>
      validateLaqathaQuestion({
        ...question('q'),
        clues: [1, 2, 3, 4, 5, 6].map((o) => clue(o)),
      }),
    ).toThrow();
  });

  it('rejects an out-of-order clue ladder', () => {
    const shuffled = question('q');
    shuffled.clues = [clue(2), clue(1), clue(3), clue(4), clue(5)];
    expect(() => validateLaqathaQuestion(shuffled)).toThrow();
  });

  it('rejects a clue with neither text nor media', () => {
    const malformed = question('q');
    malformed.clues[2] = { order: 3, value: 3 };
    expect(() => validateLaqathaQuestion(malformed)).toThrow();
  });

  it('accepts a text clue, an image clue, and an audio clue in one question', () => {
    const mixed = question('q');
    mixed.clues = [
      clue(1),
      clue(2, {
        text: undefined,
        media: {
          type: ContentMediaType.IMAGE,
          assets: [{ url: 'https://cdn/clue2.webp', altText: 'مشهد' }],
        },
      }),
      clue(3, {
        text: undefined,
        media: {
          type: ContentMediaType.AUDIO,
          assets: [{ url: 'https://cdn/clue3.mp3' }],
        },
      }),
      clue(4),
      clue(5),
    ];
    expect(validateLaqathaQuestion(mixed)).toBeDefined();
  });

  it('requires accepted answers', () => {
    expect(() =>
      validateLaqathaQuestion({ ...question('q'), acceptedAnswers: [] }),
    ).toThrow();
  });
});

describe('القطها fair-start + clue progression', () => {
  it('starts prepared with no clock, then reveals clue 1 only at activation', () => {
    const start = initial();
    expect(start.phase).toBe('preparing');
    expect(start.deadlineAt).toBeNull();
    const activated = LAQATHA_GAMEPLAY_PLUGIN.activatePresentation!(
      start,
      new Date('2026-01-01T00:00:10Z'),
      context('p1'),
    ) as GameplayModeState;
    expect(activated.phase).toBe('revealing');
    expect(activated.revealedClueCount).toBe(1);
    expect(activated.deadlineAt).toBe('2026-01-01T00:00:13.000Z');
  });

  it('reveals the next clue every 3 seconds and drops the reward 5→4→3', () => {
    let state = revealing(1, '2026-01-01T00:00:03.000Z');
    expect(project(state).currentReward).toBe(5);
    state = run(
      state,
      'expire-laqatha-phase',
      'p1',
      {},
      new Date('2026-01-01T00:00:03Z'),
    ).runtimeState;
    expect(state.revealedClueCount).toBe(2);
    expect(state.deadlineAt).toBe('2026-01-01T00:00:06.000Z');
    expect(project(state).currentReward).toBe(4);
    state = run(
      state,
      'expire-laqatha-phase',
      'p1',
      {},
      new Date('2026-01-01T00:00:06Z'),
    ).runtimeState;
    expect(state.revealedClueCount).toBe(3);
    expect(project(state).currentReward).toBe(3);
  });

  it('projects only revealed clues, never future clue content or the answer', () => {
    const view = project(revealing(2));
    const clues = JSON.parse(String(view.cluesJson)) as unknown[];
    expect(clues).toHaveLength(2);
    expect(view.acceptedAnswers).toBeUndefined();
    expect(view.revealJson).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('lion king');
    expect(JSON.stringify(view)).not.toContain('الأسد الملك');
  });

  it('ends the question with no winner if the last clue lapses unclaimed', () => {
    const state = revealing(5, '2026-01-01T00:00:15.000Z');
    const resolved = run(
      state,
      'expire-laqatha-phase',
      'p1',
      {},
      new Date('2026-01-01T00:00:15Z'),
    ).runtimeState;
    expect(resolved.phase).toBe('resolved');
    const results = JSON.parse(String(resolved.resultsJson)) as Array<{
      winnerTeamId: string | null;
    }>;
    expect(results[0].winnerTeamId).toBeNull();
  });
});

describe('القطها claim race + answer window', () => {
  it('lets the first valid claim win and freezes the clue clock and reward', () => {
    const state = revealing(2, '2026-01-01T00:00:05.000Z');
    const claimed = run(
      state,
      'claim-laqatha',
      'p1',
      {},
      new Date('2026-01-01T00:00:03.700Z'),
    ).runtimeState;
    expect(claimed.phase).toBe('claiming');
    expect(claimed.claimOwnerTeamId).toBe('t1');
    expect(claimed.frozenReward).toBe(4);
    // 5000 - 3700 = 1300ms remained to the next clue; frozen exactly.
    expect(claimed.revealRemainingMs).toBe(1300);
    // 5-second answer window from the claim instant.
    expect(claimed.deadlineAt).toBe('2026-01-01T00:00:08.700Z');
  });

  it('closes the race to a second claimant (CAS-guarded first-claim-wins)', () => {
    const state = revealing(2);
    const claimed = run(state, 'claim-laqatha', 'p1').runtimeState;
    expect(() => run(claimed, 'claim-laqatha', 'p2')).toThrow(
      /claim race is closed/i,
    );
  });

  it('awards the frozen value on a correct submission', () => {
    const claimed = run(revealing(2), 'claim-laqatha', 'p1').runtimeState;
    const resolved = run(claimed, 'submit-laqatha', 'p1', {
      answer: 'The Lion King',
    }).runtimeState;
    expect(resolved.phase).toBe('resolved');
    const results = JSON.parse(String(resolved.resultsJson)) as Array<{
      winnerTeamId: string;
      points: Record<string, number>;
      solvedAtClue: number;
    }>;
    expect(results[0].winnerTeamId).toBe('t1');
    expect(results[0].points).toEqual({ t1: 4, t2: 0 });
    expect(results[0].solvedAtClue).toBe(2);
  });

  it('grades any teammate submission through Arabic normalization', () => {
    const claimed = run(revealing(3), 'claim-laqatha', 'p1').runtimeState;
    // A different player on the claiming team, with a diacritic/spacing variant.
    const resolved = run(claimed, 'submit-laqatha', 'p1b', {
      answer: '  الاسد  الملك ',
    }).runtimeState;
    expect(resolved.phase).toBe('resolved');
  });

  it('consumes the attempt on a wrong answer and resumes the exact remaining interval for the opponent', () => {
    const state = revealing(2, '2026-01-01T00:00:05.000Z');
    const claimed = run(
      state,
      'claim-laqatha',
      'p1',
      {},
      new Date('2026-01-01T00:00:03.700Z'),
    ).runtimeState;
    const resumed = run(
      claimed,
      'submit-laqatha',
      'p1',
      { answer: 'wrong movie' },
      new Date('2026-01-01T00:00:04.200Z'),
    ).runtimeState;
    expect(resumed.phase).toBe('revealing');
    expect(JSON.parse(String(resumed.failedTeamIdsJson))).toEqual(['t1']);
    // Resumes with the SAME 1300ms that remained, from the resume instant — not a
    // fresh 3s, and not skipped forward by the 5-second typing window.
    expect(resumed.deadlineAt).toBe('2026-01-01T00:00:05.500Z');
    // The opponent may now claim; the failed team may not.
    expect(project(resumed).currentReward).toBe(4);
  });

  it('treats a 5-second answer-window timeout exactly like a wrong answer', () => {
    const claimed = run(
      revealing(2, '2026-01-01T00:00:05.000Z'),
      'claim-laqatha',
      'p1',
      {},
      new Date('2026-01-01T00:00:03.700Z'),
    ).runtimeState;
    const timedOut = run(
      claimed,
      'expire-laqatha-phase',
      'p1',
      {},
      new Date('2026-01-01T00:00:08.700Z'),
    ).runtimeState;
    expect(timedOut.phase).toBe('revealing');
    expect(JSON.parse(String(timedOut.failedTeamIdsJson))).toEqual(['t1']);
  });

  it('locks a failed team out of re-claiming the same question', () => {
    const claimed = run(revealing(2), 'claim-laqatha', 'p1').runtimeState;
    const resumed = run(claimed, 'submit-laqatha', 'p1', {
      answer: 'nope',
    }).runtimeState;
    expect(() => run(resumed, 'claim-laqatha', 'p1')).toThrow(/attempt/i);
  });

  it('ends with no winner when both teams fail', () => {
    let state = run(revealing(2), 'claim-laqatha', 'p1').runtimeState;
    state = run(state, 'submit-laqatha', 'p1', { answer: 'nope' }).runtimeState;
    state = run(state, 'claim-laqatha', 'p2').runtimeState;
    state = run(state, 'submit-laqatha', 'p2', { answer: 'nope' }).runtimeState;
    expect(state.phase).toBe('resolved');
    const results = JSON.parse(String(state.resultsJson)) as Array<{
      winnerTeamId: string | null;
    }>;
    expect(results[0].winnerTeamId).toBeNull();
  });

  it('does not let a duplicate submission double-resolve', () => {
    const claimed = run(revealing(2), 'claim-laqatha', 'p1').runtimeState;
    const resolved = run(claimed, 'submit-laqatha', 'p1', {
      answer: 'The Lion King',
    }).runtimeState;
    expect(() =>
      run(resolved, 'submit-laqatha', 'p1b', { answer: 'The Lion King' }),
    ).toThrow(/only the claiming team/i);
  });
});

describe('القطها question progression + completion', () => {
  const resolvedAt = (questionIndex: number): GameplayModeState => ({
    ...initial(),
    currentQuestionIndex: questionIndex,
    phase: 'resolved',
    revealedClueCount: 3,
    resultsJson: JSON.stringify([
      {
        questionIndex,
        contentItemId: `q${questionIndex + 1}`,
        title: 'الأسد الملك',
        winnerTeamId: 't1',
        solvedAtClue: 3,
        points: { t1: 3, t2: 0 },
        failedTeamIds: [],
        resolvedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  });

  it('opens a fresh Fair-Start generation for the next movie question', () => {
    const advanced = run(resolvedAt(0), 'advance-laqatha', 'p1');
    expect(advanced.prepareNextPresentation).toBe(true);
    expect(advanced.runtimeState.phase).toBe('preparing');
    expect(advanced.runtimeState.currentQuestionIndex).toBe(1);
    expect(advanced.runtimeState.revealedClueCount).toBe(1);
    expect(advanced.runtimeState.deadlineAt).toBeNull();
  });

  it('completes the challenge after the third question', () => {
    const done = run(resolvedAt(2), 'advance-laqatha', 'p1');
    expect(done.prepareNextPresentation).toBeFalsy();
    expect(done.runtimeState.phase).toBe('completed');
    expect(done.runtimeState.resultJson).toBeDefined();
  });
});

describe('القطها privacy projection', () => {
  it('hands a phone only its control flags, never clue media', () => {
    const owner = LAQATHA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      run(revealing(2), 'claim-laqatha', 'p1').runtimeState,
      { participantId: 'p1', teamId: 't1' } as never,
    );
    expect(owner.cluesJson).toBe('[]');
    expect(owner.canSubmit).toBe(true);
    const opponent = LAQATHA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      run(revealing(2), 'claim-laqatha', 'p1').runtimeState,
      { participantId: 'p2', teamId: 't2' } as never,
    );
    expect(opponent.canSubmit).toBe(false);
    expect(opponent.canClaim).toBe(false);
  });

  it('reveals the canonical title only once the question is resolved', () => {
    const claimed = run(revealing(2), 'claim-laqatha', 'p1').runtimeState;
    const resolved = run(claimed, 'submit-laqatha', 'p1', {
      answer: 'The Lion King',
    }).runtimeState;
    const view = project(resolved);
    expect(String(view.revealJson)).toContain('الأسد الملك');
  });

  it('reports presented content items up to the one on screen', () => {
    expect(
      LAQATHA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: { ...initial(), currentQuestionIndex: 1 },
        roundState: {},
        orderedContentItemIds: ['q1', 'q2', 'q3'],
      }),
    ).toEqual(['q1', 'q2']);
  });
});
