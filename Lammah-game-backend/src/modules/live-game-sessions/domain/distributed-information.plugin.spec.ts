import {
  DISTRIBUTED_INFORMATION_LOCK_MS,
  DISTRIBUTED_INFORMATION_PLUGIN,
  DistributedResult,
  DistributedTeamPlan,
  distributedResult,
} from './distributed-information.plugin';
import type { GameplayModeState } from './gameplay-mode.plugin';

const START = new Date('2026-01-01T00:00:00.000Z');
const DEADLINE = new Date(START.getTime() + 135_000);
const ALPHA = 'team-alpha';
const BETA = 'team-beta';

/** Three puzzles, one short-text answer each, three private segments each. */
const PUZZLES = [
  {
    contentItemId: 'item-1',
    publicPrompt: 'من هو اللاعب؟',
    segments: { A: 'لعب في إسبانيا', B: 'كرة ذهبية واحدة', C: 'اعتزل 2019' },
    answer: { mode: 'match' as const, acceptedAnswers: ['ميسي'] },
  },
  {
    contentItemId: 'item-2',
    publicPrompt: 'كم هدفاً؟',
    segments: { A: 'في الدوري', B: 'موسم واحد', C: 'رقم قياسي' },
    answer: { mode: 'closest' as const, correctValue: 34, tolerance: 0 },
  },
  {
    contentItemId: 'item-3',
    publicPrompt: 'أي نادٍ؟',
    segments: { A: 'مدينة ساحلية', B: 'قميص أزرق', C: 'تأسس 1899' },
    answer: {
      mode: 'multiple_choice' as const,
      correctOptionId: 'b',
      options: [
        { id: 'a', label: 'الأول' },
        { id: 'b', label: 'الثاني' },
      ],
    },
  },
];

/** A team plan with an explicit order, answerer schedule, and distribution. */
function plan(
  teamId: string,
  participantIds: string[],
  order: number[],
  answererIds: string[],
  assignments: Array<Array<{ participantId: string; segmentIds: string[] }>>,
): DistributedTeamPlan {
  return { teamId, participantIds, order, answererIds, assignments };
}

/** Three players: one segment each, answerer rotates through the three puzzles. */
function threePlayerPlan(teamId: string, prefix: string, order: number[]) {
  const ids = [`${prefix}-1`, `${prefix}-2`, `${prefix}-3`];
  const distribution = [
    { participantId: ids[0], segmentIds: ['A'] },
    { participantId: ids[1], segmentIds: ['B'] },
    { participantId: ids[2], segmentIds: ['C'] },
  ];
  return plan(teamId, ids, order, ids, [
    distribution,
    distribution,
    distribution,
  ]);
}

/** Two players: an approved 2+1 merge, answerer alternates A-B-A. */
function twoPlayerPlan(teamId: string, prefix: string, order: number[]) {
  const ids = [`${prefix}-1`, `${prefix}-2`];
  const distribution = [
    { participantId: ids[0], segmentIds: ['A', 'C'] },
    { participantId: ids[1], segmentIds: ['B'] },
  ];
  return plan(
    teamId,
    ids,
    order,
    [ids[0], ids[1], ids[0]],
    [distribution, distribution, distribution],
  );
}

function runtime(
  plans: DistributedTeamPlan[],
  overrides: Partial<GameplayModeState> = {},
): GameplayModeState {
  return DISTRIBUTED_INFORMATION_PLUGIN.createInitialRuntimeState({
    sessionId: 'session-1',
    runtimeId: 'runtime-1',
    initialState: {
      variant: 'three-segment-race',
      phase: 'active',
      puzzlesJson: JSON.stringify(PUZZLES),
      plansJson: JSON.stringify(plans),
      progressJson: JSON.stringify(
        plans.map((entry) => ({
          teamId: entry.teamId,
          solved: 0,
          wrongAttempts: 0,
          lastProgressAt: 0,
          lockUntil: 0,
        })),
      ),
      startedAtMs: START.getTime(),
      deadlineAt: DEADLINE.toISOString(),
      scoreEventsJson: '[]',
      ...overrides,
    },
    now: START,
  });
}

const bothTeams = () => [
  threePlayerPlan(ALPHA, 'alpha', [0, 1, 2]),
  twoPlayerPlan(BETA, 'beta', [2, 0, 1]),
];

function submit(
  state: GameplayModeState,
  participantId: string,
  contentItemId: string,
  answer: string | number,
  now = START,
) {
  return DISTRIBUTED_INFORMATION_PLUGIN.handleCommand(
    {
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      roundId: 'round-1',
      submitterParticipantId: participantId,
      now,
    },
    {
      type: 'submit-answer',
      payload: { contentItemId, answer },
      runtimeState: state,
      roundState: { phase: 'active' },
    },
  );
}

function expire(state: GameplayModeState, now: Date) {
  return DISTRIBUTED_INFORMATION_PLUGIN.handleCommand(
    { sessionId: 'session-1', runtimeId: 'runtime-1', now },
    {
      type: 'expire-race',
      payload: {},
      runtimeState: state,
      roundState: { phase: 'active' },
    },
  );
}

const progress = (state: GameplayModeState, teamId: string) =>
  (
    JSON.parse(String(state.progressJson)) as Array<{
      teamId: string;
      solved: number;
      wrongAttempts: number;
      lockUntil: number;
      lastProgressAt: number;
    }>
  ).find((entry) => entry.teamId === teamId)!;

describe('distributed-information plugin', () => {
  describe('state contract', () => {
    it('requires exactly three puzzles', () => {
      expect(() =>
        runtime(bothTeams(), {
          puzzlesJson: JSON.stringify(PUZZLES.slice(0, 2)),
        }),
      ).toThrow(/exactly 3 items/);
    });

    it('requires exactly two teams', () => {
      expect(() =>
        runtime([threePlayerPlan(ALPHA, 'alpha', [0, 1, 2])]),
      ).toThrow(/exactly two teams/);
    });

    it('refuses a solo or four-player team', () => {
      const solo = plan(
        ALPHA,
        ['alpha-1'],
        [0, 1, 2],
        ['alpha-1', 'alpha-1', 'alpha-1'],
        [
          [{ participantId: 'alpha-1', segmentIds: ['A', 'B', 'C'] }],
          [{ participantId: 'alpha-1', segmentIds: ['A', 'B', 'C'] }],
          [{ participantId: 'alpha-1', segmentIds: ['A', 'B', 'C'] }],
        ],
      );
      expect(() =>
        runtime([solo, twoPlayerPlan(BETA, 'beta', [0, 1, 2])]),
      ).toThrow(/two or three connected players/);
    });

    it('requires an authoritative deadline', () => {
      expect(() => runtime(bothTeams(), { deadlineAt: '' })).toThrow(
        /authoritative deadline/,
      );
    });

    it('keeps each team on its own persisted order', () => {
      const state = runtime(bothTeams());
      const plans = JSON.parse(
        String(state.plansJson),
      ) as DistributedTeamPlan[];
      expect(plans[0].order).toEqual([0, 1, 2]);
      expect(plans[1].order).toEqual([2, 0, 1]);
      // Nothing is recomputed on read: the same state projects the same plan.
      expect(JSON.parse(String(runtime(bothTeams()).plansJson))).toEqual(plans);
    });
  });

  describe('answering', () => {
    it('accepts the assigned answerer and advances only that team', () => {
      const state = runtime(bothTeams());

      const result = submit(state, 'alpha-1', 'item-1', 'ميسي');

      expect(progress(result.runtimeState, ALPHA).solved).toBe(1);
      // The other team stays exactly where it was.
      expect(progress(result.runtimeState, BETA).solved).toBe(0);
      expect(result.runtimeState.phase).toBe('active');
    });

    it('refuses a teammate who is not the answerer for this puzzle', () => {
      const state = runtime(bothTeams());
      expect(() => submit(state, 'alpha-2', 'item-1', 'ميسي')).toThrow(
        /Another teammate is answering/,
      );
    });

    it('refuses a player from neither team', () => {
      expect(() =>
        submit(runtime(bothTeams()), 'stranger', 'item-1', 'ميسي'),
      ).toThrow(/not playing this challenge/);
    });

    it('rejects a submission aimed at a puzzle the team has left', () => {
      const first = submit(runtime(bothTeams()), 'alpha-1', 'item-1', 'ميسي');
      // alpha has moved to item-2; item-1 is stale, not wrong.
      expect(() =>
        submit(first.runtimeState, 'alpha-2', 'item-1', 'ميسي'),
      ).toThrow(/already moved to another puzzle/);
    });

    it('resolves each supported answer mode', () => {
      let state = runtime([
        threePlayerPlan(ALPHA, 'alpha', [0, 1, 2]),
        twoPlayerPlan(BETA, 'beta', [0, 1, 2]),
      ]);
      state = submit(state, 'alpha-1', 'item-1', 'ميسي').runtimeState;
      state = submit(state, 'alpha-2', 'item-2', 34).runtimeState;
      const finished = submit(state, 'alpha-3', 'item-3', 'b');

      expect(finished.runtimeState.phase).toBe('completed');
      expect(distributedResult(finished.runtimeState)).toMatchObject({
        winnerTeamId: ALPHA,
        reason: 'first_finished',
        tie: false,
      });
    });
  });

  describe('wrong answers', () => {
    it('locks the team for exactly five seconds without advancing', () => {
      const state = runtime(bothTeams());

      const result = submit(state, 'alpha-1', 'item-1', 'رونالدو');

      const alpha = progress(result.runtimeState, ALPHA);
      expect(alpha.solved).toBe(0);
      expect(alpha.wrongAttempts).toBe(1);
      expect(alpha.lockUntil).toBe(
        START.getTime() + DISTRIBUTED_INFORMATION_LOCK_MS,
      );
      expect(DISTRIBUTED_INFORMATION_LOCK_MS).toBe(5_000);
      // The opponent is untouched by it.
      expect(progress(result.runtimeState, BETA).lockUntil).toBe(0);
    });

    it('refuses submissions while locked and accepts them after', () => {
      const locked = submit(
        runtime(bothTeams()),
        'alpha-1',
        'item-1',
        'خطأ',
      ).runtimeState;

      expect(() =>
        submit(
          locked,
          'alpha-1',
          'item-1',
          'ميسي',
          new Date(START.getTime() + 4_999),
        ),
      ).toThrow(/locked for a few seconds/);

      const retried = submit(
        locked,
        'alpha-1',
        'item-1',
        'ميسي',
        new Date(START.getTime() + 5_000),
      );
      expect(progress(retried.runtimeState, ALPHA).solved).toBe(1);
    });

    it('keeps the same answerer responsible after a wrong answer', () => {
      const locked = submit(
        runtime(bothTeams()),
        'alpha-1',
        'item-1',
        'خطأ',
      ).runtimeState;
      expect(() =>
        submit(
          locked,
          'alpha-2',
          'item-1',
          'ميسي',
          new Date(START.getTime() + 6_000),
        ),
      ).toThrow(/Another teammate is answering/);
    });

    it('does not extend the race deadline', () => {
      const locked = submit(
        runtime(bothTeams()),
        'alpha-1',
        'item-1',
        'خطأ',
      ).runtimeState;
      expect(locked.deadlineAt).toBe(DEADLINE.toISOString());
    });
  });

  describe('the deadline', () => {
    it('refuses submissions once the deadline has passed', () => {
      expect(() =>
        submit(
          runtime(bothTeams()),
          'alpha-1',
          'item-1',
          'ميسي',
          new Date(DEADLINE.getTime() + 1),
        ),
      ).toThrow(/race is over/);
    });

    it('will not resolve before the deadline', () => {
      expect(() => expire(runtime(bothTeams()), START)).toThrow(
        /still running/,
      );
    });

    it('awards the higher solved count', () => {
      const state = submit(
        runtime(bothTeams()),
        'alpha-1',
        'item-1',
        'ميسي',
      ).runtimeState;

      const result = distributedResult(
        expire(state, DEADLINE).runtimeState,
      ) as DistributedResult;

      expect(result).toMatchObject({
        winnerTeamId: ALPHA,
        tie: false,
        reason: 'timeout_progress',
      });
      expect(result.solved).toEqual({ [ALPHA]: 1, [BETA]: 0 });
    });

    it('breaks an equal count by who got there first', () => {
      let state = runtime(bothTeams());
      // Beta solves its first puzzle a second before alpha solves its own.
      state = submit(
        state,
        'beta-1',
        'item-3',
        'b',
        new Date(START.getTime() + 10_000),
      ).runtimeState;
      state = submit(
        state,
        'alpha-1',
        'item-1',
        'ميسي',
        new Date(START.getTime() + 11_000),
      ).runtimeState;

      const result = distributedResult(
        expire(state, DEADLINE).runtimeState,
      ) as DistributedResult;

      expect(result).toMatchObject({
        winnerTeamId: BETA,
        tie: false,
        reason: 'timeout_time',
      });
      expect(result.elapsedMsAtLastProgress).toEqual({
        [BETA]: 10_000,
        [ALPHA]: 11_000,
      });
    });

    it('is a tie when neither count nor timing separates the teams', () => {
      const result = distributedResult(
        expire(runtime(bothTeams()), DEADLINE).runtimeState,
      ) as DistributedResult;

      expect(result).toMatchObject({
        winnerTeamId: null,
        tie: true,
        reason: 'tie',
      });
    });

    it('resolves a finished race idempotently', () => {
      let state = runtime([
        threePlayerPlan(ALPHA, 'alpha', [0, 1, 2]),
        twoPlayerPlan(BETA, 'beta', [0, 1, 2]),
      ]);
      state = submit(state, 'alpha-1', 'item-1', 'ميسي').runtimeState;
      state = submit(state, 'alpha-2', 'item-2', 34).runtimeState;
      state = submit(state, 'alpha-3', 'item-3', 'b').runtimeState;
      const before = distributedResult(state);

      const again = expire(state, DEADLINE);

      expect(distributedResult(again.runtimeState)).toEqual(before);
      expect(again.eventType).toBe('distributed-race-already-resolved');
    });

    it('refuses a submission after the race is decided', () => {
      let state = runtime([
        threePlayerPlan(ALPHA, 'alpha', [0, 1, 2]),
        twoPlayerPlan(BETA, 'beta', [0, 1, 2]),
      ]);
      state = submit(state, 'alpha-1', 'item-1', 'ميسي').runtimeState;
      state = submit(state, 'alpha-2', 'item-2', 34).runtimeState;
      state = submit(state, 'alpha-3', 'item-3', 'b').runtimeState;

      expect(() => submit(state, 'beta-1', 'item-1', 'ميسي')).toThrow(
        /already finished/,
      );
    });
  });

  describe('projections', () => {
    const actor = (participantId?: string, controller = false) => ({
      controller,
      participantId,
      teamId: undefined,
    });

    it('gives a participant only the segments they hold', () => {
      const state = runtime(bothTeams());

      const first = DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
        state,
        actor('alpha-1'),
      );
      const second =
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor('alpha-2'),
        );

      expect(JSON.parse(String(first.mySegmentsJson))).toEqual([
        { id: 'A', content: 'لعب في إسبانيا' },
      ]);
      expect(JSON.parse(String(second.mySegmentsJson))).toEqual([
        { id: 'B', content: 'كرة ذهبية واحدة' },
      ]);
      // A teammate's private text never reaches the other teammate.
      expect(JSON.stringify(first)).not.toContain('كرة ذهبية');
      expect(JSON.stringify(second)).not.toContain('إسبانيا');
    });

    it('gives a two-player answerer their merged pair', () => {
      const projected =
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          runtime(bothTeams()),
          actor('beta-1'),
        );

      expect(
        (
          JSON.parse(String(projected.mySegmentsJson)) as Array<{ id: string }>
        ).map((segment) => segment.id),
      ).toEqual(['A', 'C']);
      expect(projected.isAnswerer).toBe(true);
    });

    it('marks only the assigned answerer', () => {
      const state = runtime(bothTeams());
      expect(
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor('alpha-1'),
        ).isAnswerer,
      ).toBe(true);
      expect(
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor('alpha-3'),
        ).isAnswerer,
      ).toBe(false);
    });

    it('never projects an answer, another plan, or a future puzzle', () => {
      const state = runtime(bothTeams());
      const projected =
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor('alpha-1'),
        );
      const serialized = JSON.stringify(projected);

      expect(serialized).not.toContain('ميسي');
      expect(serialized).not.toContain('acceptedAnswers');
      expect(serialized).not.toContain('correctOptionId');
      expect(serialized).not.toContain('correctValue');
      expect(serialized).not.toContain('plansJson');
      expect(serialized).not.toContain('answererIds');
      // Only the current puzzle's prompt, never the next one's.
      expect(serialized).toContain('من هو اللاعب؟');
      expect(serialized).not.toContain('كم هدفاً؟');
    });

    it('shows the shared screen progress only', () => {
      const shared = DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeState(
        runtime(bothTeams()),
      );
      const serialized = JSON.stringify(shared);

      expect(serialized).not.toContain('لعب في إسبانيا');
      expect(serialized).not.toContain('ميسي');
      expect(serialized).not.toContain('mySegmentsJson');
      expect(
        JSON.parse(String(shared.progressJson)) as Array<{ teamId: string }>,
      ).toHaveLength(2);
      expect(shared.deadlineAt).toBe(DEADLINE.toISOString());
    });

    it('projects the same assignment after a reconnect', () => {
      const state = runtime(bothTeams());
      const before =
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor('beta-2'),
        );

      // A reconnect re-reads the stored state; nothing is randomized again.
      const restored =
        DISTRIBUTED_INFORMATION_PLUGIN.validateRuntimeState(state);
      const after = DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
        restored,
        actor('beta-2'),
      );

      expect(after).toEqual(before);
    });

    it('tells a finished team it is waiting', () => {
      let state = runtime([
        threePlayerPlan(ALPHA, 'alpha', [0, 1, 2]),
        twoPlayerPlan(BETA, 'beta', [0, 1, 2]),
      ]);
      state = submit(state, 'alpha-1', 'item-1', 'ميسي').runtimeState;
      state = submit(state, 'alpha-2', 'item-2', 34).runtimeState;

      const projected =
        DISTRIBUTED_INFORMATION_PLUGIN.projectRuntimeStateForActor!(
          submit(state, 'alpha-3', 'item-3', 'b').runtimeState,
          actor('alpha-1'),
        );

      expect(projected.myTeamFinished).toBe(true);
      expect(projected.mySegmentsJson).toBeUndefined();
    });
  });
});
