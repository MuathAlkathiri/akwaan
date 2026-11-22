import {
  MARHALA_COMMANDS,
  MARHALA_GAMEPLAY_PLUGIN,
  MARHALA_TURN_ACTION,
  marhalaActiveTeamId,
  marhalaResult,
  MarhalaRuntimeQuestion,
  MarhalaTurnResult,
} from './marhala-gameplay.plugin';
import {
  MARHALA_FINISH_POSITION,
  MARHALA_START_POSITION,
  MarhalaDifficulty,
} from './marhala-board';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignNextTeamActionOrHold,
  buildTeamRotations,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';
import {
  C4_GUARDED_V1,
  fingerprintAnswers,
} from '../../../common/utils/answer-matching.util';
import { TOLERANT_MATCHING_ENV } from '../../../common/utils/answer-matching-activation';

/**
 * The المرحلة state machine.
 *
 * Two rules run through all of it. The team commits to a difficulty **before**
 * seeing the question, so the risk decision is positional rather than informed by
 * the content. And the server owns every consequence — the roll, the landing, the
 * tile, the winner — so nothing a client sends can move a token.
 */
describe('المرحلة gameplay', () => {
  const TEAM_A = 'team-a';
  const TEAM_B = 'team-b';
  const NOW = new Date('2026-08-20T12:00:00.000Z');

  const question = (
    difficulty: MarhalaDifficulty,
    contentItemId = 'item-1',
  ): MarhalaRuntimeQuestion => ({
    contentItemId,
    scopeId: 'scope-gta',
    difficulty,
    prompt: { ar: 'من صاحب هذه اللعبة؟' },
    acceptedAnswers: ['روكستار'],
  });

  const runtime = (overrides: GameplayModeState = {}): GameplayModeState => ({
    phase: 'difficulty-choice',
    teamIdsJson: JSON.stringify([TEAM_A, TEAM_B]),
    positionsJson: JSON.stringify({
      [TEAM_A]: MARHALA_START_POSITION,
      [TEAM_B]: MARHALA_START_POSITION,
    }),
    turnsJson: JSON.stringify([]),
    activeTeamIndex: 0,
    ...overrides,
  });

  /** The live roster, as the session layer supplies it to every command. */
  const ROSTER = [
    { participantId: 'player-a', teamId: TEAM_A, connected: true },
    { participantId: 'player-b', teamId: TEAM_B, connected: true },
  ];

  /**
   * A command from a real submitter.
   *
   * `submittedBy` defaults to whichever phone the mechanic's own active team is
   * holding, because that is who sends a player command in the running product —
   * a spec that omitted it was exercising a caller the runtime never produces.
   */
  const send = (
    type: string,
    runtimeState: GameplayModeState,
    payload: GameplayModeState = {},
    submittedBy?: string,
  ) => {
    const activeTeamId = marhalaActiveTeamId(runtimeState);
    const submitter =
      submittedBy ??
      ROSTER.find((entry) => entry.teamId === activeTeamId)?.participantId;
    return MARHALA_GAMEPLAY_PLUGIN.handleCommand(
      {
        sessionId: 's1',
        runtimeId: 'runtime-1',
        now: NOW,
        eligibleParticipants: ROSTER,
        ...(submitter ? { submitterParticipantId: submitter } : {}),
        // Questions, availability and depletion only ever come from the
        // server's own supplier.
        ...(type === MARHALA_COMMANDS.openQuestion ||
        type === MARHALA_COMMANDS.refreshAvailability ||
        type === MARHALA_COMMANDS.exhausted
          ? { serverOwnedCommand: true }
          : {}),
      },
      {
        type,
        payload,
        // An expiry is only ever sent once the clock has run out: give the
        // question a deadline already behind NOW unless the test set one.
        runtimeState:
          type === MARHALA_COMMANDS.expireQuestion && !runtimeState.deadlineAt
            ? { ...runtimeState, deadlineAt: '2026-08-20T11:59:00.000Z' }
            : runtimeState,
        roundState: { phase: runtimeState.phase },
      },
    );
  };

  const positionsOf = (state: GameplayModeState) =>
    JSON.parse(String(state.positionsJson)) as Record<string, number>;
  const turnsOf = (state: GameplayModeState) =>
    JSON.parse(String(state.turnsJson)) as MarhalaTurnResult[];

  /** Walk a team to a position by rewriting state, so a test can aim at a tile. */
  const at = (position: number, overrides: GameplayModeState = {}) =>
    runtime({
      positionsJson: JSON.stringify({
        [TEAM_A]: position,
        [TEAM_B]: MARHALA_START_POSITION,
      }),
      ...overrides,
    });

  /** Open a question of a difficulty for the active team. */
  const opened = (difficulty: MarhalaDifficulty, state: GameplayModeState) => {
    const chosen = send(MARHALA_COMMANDS.chooseDifficulty, state, {
      difficulty,
    }).runtimeState;
    return send(MARHALA_COMMANDS.openQuestion, chosen, {
      questionJson: JSON.stringify(question(difficulty)),
    }).runtimeState;
  };

  describe('whose turn it is', () => {
    /**
     * A turn belongs to the team standing on the tile.
     *
     * `connected-player` lets any phone in the room past the session layer, which
     * is correct for a mechanic where either team may act — but in المرحلة the
     * band *is* the decision, so the opponent electing it, or answering in the
     * active team's place, would hand over their turn. Found by local smoke: the
     * opposing phone successfully chose صعب for the team on the clock.
     */
    it('refuses a difficulty elected by the other team', () => {
      expect(() =>
        send(
          MARHALA_COMMANDS.chooseDifficulty,
          runtime(),
          { difficulty: 'hard' },
          'player-b',
        ),
      ).toThrow(/whose turn it is/);
    });

    it('refuses an answer submitted by the other team', () => {
      const open = opened('easy', runtime());
      expect(() =>
        send(
          MARHALA_COMMANDS.submitAnswer,
          open,
          { answer: 'روكستار' },
          'player-b',
        ),
      ).toThrow(/whose turn it is/);
    });

    it('refuses a submitter who cannot be placed on a team at all', () => {
      // An unidentifiable actor is not evidence of permission.
      expect(() =>
        send(
          MARHALA_COMMANDS.chooseDifficulty,
          runtime(),
          { difficulty: 'easy' },
          'ghost-participant',
        ),
      ).toThrow(/whose turn it is/);
    });

    it('lets each team act on its own turn, in turn', () => {
      // Team A plays, gets it wrong, and the turn passes; then team B's phone —
      // and only team B's — may elect the next band.
      const open = opened('easy', runtime());
      const passed = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'إجابة خاطئة',
      }).runtimeState;
      expect(marhalaActiveTeamId(passed)).toBe(TEAM_B);
      expect(() =>
        send(
          MARHALA_COMMANDS.chooseDifficulty,
          passed,
          { difficulty: 'medium' },
          'player-a',
        ),
      ).toThrow(/whose turn it is/);
      expect(
        send(
          MARHALA_COMMANDS.chooseDifficulty,
          passed,
          { difficulty: 'medium' },
          'player-b',
        ).runtimeState.phase,
      ).toBe('question-pending');
    });
  });

  describe('the opening board', () => {
    it('starts both teams on the same tile with the first team active', () => {
      const state = MARHALA_GAMEPLAY_PLUGIN.createInitialRuntimeState({
        sessionId: 's1',
        runtimeId: 'runtime-1',
        initialState: runtime(),
      });
      expect(positionsOf(state)).toEqual({
        [TEAM_A]: MARHALA_START_POSITION,
        [TEAM_B]: MARHALA_START_POSITION,
      });
      expect(marhalaActiveTeamId(state)).toBe(TEAM_A);
      expect(state.phase).toBe('difficulty-choice');
    });

    it('refuses a runtime that is not two distinct teams', () => {
      expect(() =>
        MARHALA_GAMEPLAY_PLUGIN.validateRuntimeState(
          runtime({ teamIdsJson: JSON.stringify([TEAM_A]) }),
        ),
      ).toThrow(/two distinct teams/);
    });
  });

  describe('choosing a difficulty comes before the question', () => {
    it('moves to question-pending without any content', () => {
      const next = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'hard',
      }).runtimeState;
      expect(next.phase).toBe('question-pending');
      expect(next.selectedDifficulty).toBe('hard');
      // Nothing is drawn by the plugin: it holds no deck and owns no repository.
      expect(next.questionJson ?? null).toBeNull();
    });

    it('publishes the landings that choice could produce, never the roll', () => {
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, at(5), {
        difficulty: 'medium',
      }).runtimeState;
      const projected = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(chosen);
      expect(JSON.parse(String(projected.possibleLandingsJson))).toEqual([
        7, 8, 9,
      ]);
      expect(Object.keys(projected)).not.toContain('movement');
    });

    it('rejects an unknown difficulty', () => {
      expect(() =>
        send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
          difficulty: 'impossible',
        }),
      ).toThrow(/Unknown المرحلة difficulty/);
    });

    it('rejects a difficulty the server has no content for', () => {
      // Availability is the server's answer, not the client's.
      expect(() =>
        send(
          MARHALA_COMMANDS.chooseDifficulty,
          runtime({
            availableDifficultiesJson: JSON.stringify(['easy', 'medium']),
          }),
          { difficulty: 'hard' },
        ),
      ).toThrow(/No unseen content remains/);
    });

    it('cannot be chosen once a question is open', () => {
      const open = opened('easy', runtime());
      expect(() =>
        send(MARHALA_COMMANDS.chooseDifficulty, open, { difficulty: 'easy' }),
      ).toThrow(/only be chosen before/);
    });
  });

  describe('commands only the server may send', () => {
    const openQuestion = () => {
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      return send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(question('easy')),
      }).runtimeState;
    };
    const raw = (type: string, state: GameplayModeState, payload = {}) =>
      MARHALA_GAMEPLAY_PLUGIN.handleCommand(
        { sessionId: 's1', runtimeId: 'runtime-1', now: NOW },
        {
          type,
          payload,
          runtimeState: state,
          roundState: { phase: state.phase },
        },
      );

    it('refuses an expiry before the deadline', () => {
      const open = {
        ...openQuestion(),
        deadlineAt: '2026-08-20T12:00:30.000Z',
      };
      expect(() => raw(MARHALA_COMMANDS.expireQuestion, open)).toThrow(
        'The question cannot expire before its deadline',
      );
    });

    it('refuses an expiry when no deadline is running', () => {
      expect(() =>
        raw(MARHALA_COMMANDS.expireQuestion, {
          ...openQuestion(),
          deadlineAt: null,
        }),
      ).toThrow('The question cannot expire before its deadline');
    });

    it('accepts an expiry once the deadline has passed', () => {
      const next = raw(MARHALA_COMMANDS.expireQuestion, {
        ...openQuestion(),
        deadlineAt: '2026-08-20T12:00:00.000Z',
      }).runtimeState;
      expect(turnsOf(next)[0]).toMatchObject({ resolvedBy: 'timeout' });
    });

    it.each([
      [MARHALA_COMMANDS.exhausted, {}],
      [
        MARHALA_COMMANDS.refreshAvailability,
        { availableDifficultiesJson: JSON.stringify(['easy']) },
      ],
    ])('refuses %s without the server provenance', (type, payload) => {
      expect(() => raw(type, runtime(), payload)).toThrow(
        'Only the server can change what المرحلة can still serve',
      );
    });
  });

  describe('who may supply a question', () => {
    it('refuses a question the server did not draw, whoever sends it', () => {
      // Authorised for the controller, which the host's user also is — so the
      // actor cannot tell the server's draw from a host's request. Without the
      // server's provenance the question, its answers and its guard are refused.
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      expect(() =>
        MARHALA_GAMEPLAY_PLUGIN.handleCommand(
          {
            sessionId: 's1',
            runtimeId: 'runtime-1',
            now: NOW,
            eligibleParticipants: ROSTER,
          },
          {
            type: MARHALA_COMMANDS.openQuestion,
            payload: { questionJson: JSON.stringify(question('easy')) },
            runtimeState: chosen,
            roundState: { phase: chosen.phase },
          },
        ),
      ).toThrow('An المرحلة question can only be opened by the server');
    });
  });

  describe('the supplied question', () => {
    it('opens with a clock and the prompt, never the answers', () => {
      const open = opened('easy', runtime());
      expect(open.phase).toBe('question');
      expect(open.deadlineAt).toBeNull();
      const projected = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(open);
      expect(projected.questionPrompt).toBeTruthy();
      expect(JSON.stringify(projected)).not.toContain('روكستار');
    });

    it('refuses a question of the wrong difficulty', () => {
      // Never answer a Hard request with an easier question.
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'hard',
      }).runtimeState;
      expect(() =>
        send(MARHALA_COMMANDS.openQuestion, chosen, {
          questionJson: JSON.stringify(question('easy')),
        }),
      ).toThrow(/does not match the chosen difficulty/);
    });

    it('cannot be opened when none was requested', () => {
      expect(() =>
        send(MARHALA_COMMANDS.openQuestion, runtime(), {
          questionJson: JSON.stringify(question('easy')),
        }),
      ).toThrow(/No المرحلة question was requested/);
    });
  });

  describe('a correct answer moves the team', () => {
    it.each([
      ['easy', 1, 2],
      ['medium', 2, 4],
      ['hard', 4, 6],
    ] as const)('moves %s only within %i–%i', (difficulty, min, max) => {
      const open = opened(difficulty, at(1));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      expect(turn.correct).toBe(true);
      expect(turn.movement).toBeGreaterThanOrEqual(min);
      expect(turn.movement).toBeLessThanOrEqual(max);
    });

    it('grades through the canonical Arabic normalizer', () => {
      const open = opened('easy', at(1));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: '  روكستار  ',
      }).runtimeState;
      expect(turnsOf(next).at(-1)!.correct).toBe(true);
    });

    it('stays put on a normal tile', () => {
      // From 1, easy can only reach 2 or 3; aim from 6 where easy reaches 7 or 8.
      const open = opened('easy', at(6));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      if (turn.tile === 'normal') {
        expect(turn.finalLanding).toBe(turn.baseLanding);
      }
      expect(['normal', 'boost']).toContain(turn.tile);
    });

    it('takes a boost to its destination', () => {
      // From 2, easy lands on 3 or 4: 3 is a boost to 7, 4 is a trap to 1.
      const open = opened('easy', at(2));
      const turn = turnsOf(
        send(MARHALA_COMMANDS.submitAnswer, open, { answer: 'روكستار' })
          .runtimeState,
      ).at(-1)!;
      if (turn.tile === 'boost') {
        expect(turn.baseLanding).toBe(3);
        expect(turn.finalLanding).toBe(7);
      } else {
        expect(turn.tile).toBe('trap');
        expect(turn.finalLanding).toBe(1);
      }
    });

    it('never resolves a second tile after an effect', () => {
      // Every destination is a safe tile by configuration, so one resolution is
      // always enough — no boost → trap → boost recursion exists.
      const open = opened('easy', at(2));
      const turn = turnsOf(
        send(MARHALA_COMMANDS.submitAnswer, open, { answer: 'روكستار' })
          .runtimeState,
      ).at(-1)!;
      expect([1, 2, 7, 13, 16, turn.baseLanding]).toContain(turn.finalLanding);
    });

    it('passes the turn when the race continues', () => {
      const open = opened('easy', at(1));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      if (next.phase !== 'completed') {
        expect(next.phase).toBe('difficulty-choice');
        expect(marhalaActiveTeamId(next)).toBe(TEAM_B);
        // The next team starts from a clean decision.
        expect(next.questionJson ?? null).toBeNull();
        expect(next.selectedDifficulty ?? null).toBeNull();
      }
    });
  });

  describe('reaching the finish', () => {
    it('wins by landing exactly on 16', () => {
      const open = opened('easy', at(15));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      expect(next.phase).toBe('completed');
      expect(marhalaResult(next)).toMatchObject({
        winnerTeamId: TEAM_A,
        endedBy: 'finish',
      });
    });

    it('wins by passing 16 rather than overshooting off the board', () => {
      const open = opened('hard', at(13));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      expect(next.phase).toBe('completed');
      expect(positionsOf(next)[TEAM_A]).toBe(MARHALA_FINISH_POSITION);
    });

    it('records an overshoot as landing on 16, never off the board', () => {
      // From 13 hard rolls 4–6, so the base landing is 17, 18 or 19. The turn the
      // board narrates must say 16: a recorded position that does not exist on the
      // board would be nonsense for any screen reading it back.
      const open = opened('hard', at(13));
      const turn = turnsOf(
        send(MARHALA_COMMANDS.submitAnswer, open, { answer: 'روكستار' })
          .runtimeState,
      ).at(-1)!;
      expect(turn.movement).toBeGreaterThanOrEqual(4);
      expect(turn.baseLanding).toBe(MARHALA_FINISH_POSITION);
      expect(turn.finalLanding).toBe(MARHALA_FINISH_POSITION);
      expect(turn.tile).toBe('finish');
    });

    it('wins when a boost carries the team to the finish', () => {
      // From 11, easy lands on 12 or 13; 12 is a boost straight to 16.
      const open = opened('easy', at(11));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      if (turn.baseLanding === 12) {
        expect(turn.finalLanding).toBe(16);
        expect(next.phase).toBe('completed');
      }
    });

    it('accepts no further command once the race is won', () => {
      const won = send(MARHALA_COMMANDS.submitAnswer, opened('easy', at(15)), {
        answer: 'روكستار',
      }).runtimeState;
      for (const type of Object.values(MARHALA_COMMANDS)) {
        expect(() => send(type, won, { difficulty: 'easy' })).toThrow(
          /already ended/,
        );
      }
    });
  });

  describe('a wrong answer and an expired clock cost the same', () => {
    it('moves nobody on a wrong answer and passes the turn', () => {
      const open = opened('hard', at(5));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'إجابة خاطئة',
      }).runtimeState;
      expect(positionsOf(next)[TEAM_A]).toBe(5);
      const turn = turnsOf(next).at(-1)!;
      expect(turn).toMatchObject({ correct: false, resolvedBy: 'answer' });
      expect(turn.movement).toBeUndefined();
      expect(marhalaActiveTeamId(next)).toBe(TEAM_B);
    });

    it('treats a timeout exactly as a wrong answer', () => {
      const open = opened('hard', at(5));
      const next = send(MARHALA_COMMANDS.expireQuestion, open).runtimeState;
      expect(positionsOf(next)[TEAM_A]).toBe(5);
      const turn = turnsOf(next).at(-1)!;
      expect(turn).toMatchObject({ correct: false, resolvedBy: 'timeout' });
      expect(turn.movement).toBeUndefined();
      expect(marhalaActiveTeamId(next)).toBe(TEAM_B);
    });

    it('still counts the question as played, because it was seen', () => {
      const open = opened('hard', at(5));
      const next = send(MARHALA_COMMANDS.expireQuestion, open).runtimeState;
      expect(
        MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: next,
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual(['item-1']);
    });

    it('cannot expire a question that is not open', () => {
      expect(() => send(MARHALA_COMMANDS.expireQuestion, runtime())).toThrow(
        /No المرحلة question is open/,
      );
    });
  });

  describe('turns alternate', () => {
    it('hands the board back and forth', () => {
      let state = runtime();
      const order: string[] = [];
      for (let turn = 0; turn < 4 && state.phase !== 'completed'; turn += 1) {
        order.push(marhalaActiveTeamId(state));
        state = send(
          MARHALA_COMMANDS.expireQuestion,
          opened('easy', state),
        ).runtimeState;
      }
      expect(order).toEqual([TEAM_A, TEAM_B, TEAM_A, TEAM_B]);
    });
  });

  describe('presented content', () => {
    it('reports only questions actually put in front of a team', () => {
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      // A difficulty chosen but no question yet drawn burns nothing.
      expect(
        MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: chosen,
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual([]);
    });

    it('counts the open question and every resolved one', () => {
      const first = send(
        MARHALA_COMMANDS.expireQuestion,
        opened('easy', runtime()),
      ).runtimeState;
      const second = send(
        MARHALA_COMMANDS.openQuestion,
        send(MARHALA_COMMANDS.chooseDifficulty, first, { difficulty: 'easy' })
          .runtimeState,
        { questionJson: JSON.stringify(question('easy', 'item-2')) },
      ).runtimeState;

      expect(
        MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: second,
          roundState: {},
          orderedContentItemIds: [],
        }).sort(),
      ).toEqual(['item-1', 'item-2']);
    });

    it('never throws on malformed state', () => {
      expect(
        MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: {},
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual([]);
    });
  });

  describe('running out of content', () => {
    it('ends with no winner rather than inventing one', () => {
      const next = send(MARHALA_COMMANDS.exhausted, at(9)).runtimeState;
      expect(next.phase).toBe('completed');
      expect(marhalaResult(next)).toMatchObject({
        winnerTeamId: null,
        endedBy: 'content-exhausted',
      });
    });

    it('keeps the board it ended on, so the Match can explain itself', () => {
      const next = send(MARHALA_COMMANDS.exhausted, at(9)).runtimeState;
      expect(marhalaResult(next)!.positions[TEAM_A]).toBe(9);
    });
  });

  describe('the deadline contract', () => {
    it('expires the question, and only while one is open', () => {
      expect(MARHALA_GAMEPLAY_PLUGIN.deadline).toEqual({
        source: 'runtime-state',
        commandType: MARHALA_COMMANDS.expireQuestion,
        activePhases: ['question'],
      });
    });

    it('leaves the difficulty decision unclocked', () => {
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      expect(chosen.deadlineAt ?? null).toBeNull();
    });
  });

  describe('who may do what', () => {
    it('lets a connected player choose and answer', () => {
      for (const type of [
        MARHALA_COMMANDS.chooseDifficulty,
        MARHALA_COMMANDS.submitAnswer,
      ]) {
        expect(MARHALA_GAMEPLAY_PLUGIN.command(type)?.authorization).toBe(
          'connected-player',
        );
      }
    });

    it('keeps content, expiry and exhaustion server-owned', () => {
      // A player cannot hand the runtime its own question, expire its own clock,
      // or declare the catalog empty.
      for (const type of [
        MARHALA_COMMANDS.openQuestion,
        MARHALA_COMMANDS.expireQuestion,
        MARHALA_COMMANDS.exhausted,
      ]) {
        expect(MARHALA_GAMEPLAY_PLUGIN.command(type)?.authorization).toBe(
          'controller',
        );
      }
    });

    it('knows no command outside its own vocabulary', () => {
      expect(
        MARHALA_GAMEPLAY_PLUGIN.command('submit-combo-answer'),
      ).toBeUndefined();
    });
  });

  describe('the answer a resolved turn carries', () => {
    /**
     * المرحلة records the answer truth onto the turn, and only there.
     *
     * A turn exists because the question is over, so that is the first moment
     * the canonical answer is safe to keep beside what the team actually sent.
     * While the question is open the projection must carry neither.
     */
    it('keeps both answers off an open question', () => {
      const open = opened('easy', at(1));
      const projected = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(open);
      const serialized = JSON.stringify(projected);
      expect(serialized).not.toContain('روكستار');
      expect(projected.lastTurnJson ?? null).toBeNull();
    });

    it('records what was sent and what was canonical once it resolves', () => {
      const open = opened('easy', at(1));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'روكستار',
      }).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      expect(turn.submittedAnswer).toBe('روكستار');
      expect(turn.correctAnswer).toBe('روكستار');
    });

    it('keeps a wrong answer beside the canonical one', () => {
      const open = opened('easy', at(1));
      const next = send(MARHALA_COMMANDS.submitAnswer, open, {
        answer: 'إجابة خاطئة',
      }).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      expect(turn.correct).toBe(false);
      expect(turn.submittedAnswer).toBe('إجابة خاطئة');
      expect(turn.correctAnswer).toBe('روكستار');
    });

    it('invents no submission when the clock runs out', () => {
      const open = opened('easy', at(1));
      const next = send(MARHALA_COMMANDS.expireQuestion, open, {}).runtimeState;
      const turn = turnsOf(next).at(-1)!;
      expect(turn.resolvedBy).toBe('timeout');
      expect(turn.submittedAnswer).toBeNull();
      expect(turn.correctAnswer).toBe('روكستار');
    });
  });

  describe('per-actor projection', () => {
    it('tells a team whether the board is waiting on it', () => {
      const open = opened('easy', runtime());
      const active = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        open,
        {
          controller: false,
          teamId: TEAM_A,
        },
      );
      const waiting = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        open,
        {
          controller: false,
          teamId: TEAM_B,
        },
      );
      expect(active.isActiveTeam).toBe(true);
      expect(waiting.isActiveTeam).toBe(false);
      // Neither is given the answers.
      expect(JSON.stringify([active, waiting])).not.toContain('روكستار');
    });
  });

  describe('multimodal media presentation & privacy', () => {
    it('projects image media with type, url, and altText safely without answers', () => {
      const imgQ: MarhalaRuntimeQuestion = {
        contentItemId: 'item-img-1',
        scopeId: 'scope-overwatch',
        difficulty: 'medium',
        prompt: { ar: 'من هذه الشخصية؟' },
        media: {
          type: 'image',
          url: 'https://media.akwaan.com/images/overwatch-tracer.webp',
          altText: 'صورة شخصية',
        },
        acceptedAnswers: ['ترايسر', 'تريسر'],
      };

      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'medium',
      }).runtimeState;
      const openedState = send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(imgQ),
      }).runtimeState;

      const projected =
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(openedState);

      expect(projected.questionMediaJson).toBeDefined();
      const media = JSON.parse(String(projected.questionMediaJson));
      expect(media).toEqual({
        type: 'image',
        url: 'https://media.akwaan.com/images/overwatch-tracer.webp',
        altText: 'صورة شخصية',
      });

      // Zero answer leakage
      expect(JSON.stringify(projected)).not.toContain('ترايسر');
      expect(JSON.stringify(projected)).not.toContain('acceptedAnswers');
      expect(projected.answersJson).toBeUndefined();
    });

    it('projects audio media with type and url without answers', () => {
      const audioQ: MarhalaRuntimeQuestion = {
        contentItemId: 'item-aud-1',
        scopeId: 'scope-overwatch',
        difficulty: 'hard',
        prompt: { ar: 'صوت أي شخصية هذا؟' },
        media: {
          type: 'audio',
          url: 'https://media.akwaan.com/audio/high-noon.mp3',
        },
        acceptedAnswers: ['كاسيدي', 'ماكري'],
      };

      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'hard',
      }).runtimeState;
      const openedState = send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(audioQ),
      }).runtimeState;

      const projected =
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(openedState);

      expect(projected.questionMediaJson).toBeDefined();
      const media = JSON.parse(String(projected.questionMediaJson));
      expect(media).toEqual({
        type: 'audio',
        url: 'https://media.akwaan.com/audio/high-noon.mp3',
      });

      // Zero answer leakage
      expect(JSON.stringify(projected)).not.toContain('كاسيدي');
      expect(JSON.stringify(projected)).not.toContain('ماكري');
    });

    it('omits questionMediaJson for text-only questions', () => {
      const textQ = question('easy', 'item-text-1');
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      const openedState = send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(textQ),
      }).runtimeState;

      const projected =
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(openedState);

      expect(projected.questionMediaJson).toBeUndefined();
      expect(projected.questionPrompt).toBeDefined();
    });

    it('clears media upon resolving turn or passing to next turn', () => {
      const imgQ: MarhalaRuntimeQuestion = {
        contentItemId: 'item-img-1',
        scopeId: 'scope-overwatch',
        difficulty: 'easy',
        prompt: { ar: 'من هذه الشخصية؟' },
        media: {
          type: 'image',
          url: 'https://media.akwaan.com/images/tracer.webp',
        },
        acceptedAnswers: ['ترايسر'],
      };

      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      const openedState = send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(imgQ),
      }).runtimeState;

      // Submit answer (incorrect or correct) resolves turn and passes to next team
      const resolved = send(MARHALA_COMMANDS.submitAnswer, openedState, {
        answer: 'إجابة خاطئة',
      }).runtimeState;

      const projected = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(resolved);

      expect(projected.questionMediaJson).toBeUndefined();
      expect(projected.questionPrompt).toBeUndefined();
      expect(projected.phase).toBe('difficulty-choice');
    });
  });

  describe('typo tolerance (Phase B: built, switched off by default)', () => {
    // روكستار, and a different publisher one letter away in the same World.
    const ACCEPTED = ['روكستار'];
    const guarded = (blocked: string[] = []): MarhalaRuntimeQuestion => ({
      ...question('easy'),
      answerGuard: {
        policyId: C4_GUARDED_V1.id,
        answersFingerprint: fingerprintAnswers(ACCEPTED),
        catalogFingerprint: 'catalog',
        blockedAnswers: blocked,
      },
    });
    const openWith = (q: MarhalaRuntimeQuestion) => {
      const chosen = send(MARHALA_COMMANDS.chooseDifficulty, runtime(), {
        difficulty: 'easy',
      }).runtimeState;
      return send(MARHALA_COMMANDS.openQuestion, chosen, {
        questionJson: JSON.stringify(q),
      }).runtimeState;
    };
    const answer = (state: GameplayModeState, typed: string) =>
      send(MARHALA_COMMANDS.submitAnswer, state, { answer: typed })
        .runtimeState;
    const withTolerance = <T>(run: () => T): T => {
      const previous = process.env[TOLERANT_MATCHING_ENV];
      process.env[TOLERANT_MATCHING_ENV] = 'marhala';
      try {
        return run();
      } finally {
        if (previous === undefined) delete process.env[TOLERANT_MATCHING_ENV];
        else process.env[TOLERANT_MATCHING_ENV] = previous;
      }
    };

    it('is exact-only by default, even when the question carries a guard', () => {
      const next = answer(openWith(guarded()), 'روكستر');
      expect(turnsOf(next)[0]).toMatchObject({ correct: false });
      expect(positionsOf(next)[TEAM_A]).toBe(MARHALA_START_POSITION);
    });

    it('accepts an exact answer exactly as before', () => {
      const next = answer(openWith(guarded()), 'روكستار');
      expect(turnsOf(next)[0]).toMatchObject({ correct: true });
    });

    it('credits a guarded typo once switched on, and moves the team exactly once', () => {
      withTolerance(() => {
        const next = answer(openWith(guarded()), 'روكستر');
        const turns = turnsOf(next);
        expect(turns).toHaveLength(1);
        expect(turns[0]).toMatchObject({ correct: true, teamId: TEAM_A });
        expect(turns[0].movement).toBeGreaterThanOrEqual(1);
        // Wherever the server's roll and tile put it — recorded once.
        expect(positionsOf(next)[TEAM_A]).toBe(
          turns[0].finalLanding ?? turns[0].baseLanding,
        );
        expect(positionsOf(next)[TEAM_A]).toBeGreaterThan(
          MARHALA_START_POSITION,
        );
        // The question is spent: a second answer cannot move anyone again.
        expect(() => answer(next, 'روكستار')).toThrow();
      });
    });

    it('refuses a typo the guard says could be another entity', () => {
      withTolerance(() => {
        const next = answer(openWith(guarded(['روكستال'])), 'روكستا');
        expect(turnsOf(next)[0]).toMatchObject({ correct: false });
        expect(positionsOf(next)[TEAM_A]).toBe(MARHALA_START_POSITION);
      });
    });

    it('stays exact without a guard, or with one built for other answers', () => {
      withTolerance(() => {
        expect(
          turnsOf(answer(openWith(question('easy')), 'روكستر'))[0],
        ).toMatchObject({ correct: false });
        const forged: MarhalaRuntimeQuestion = {
          ...guarded(),
          answerGuard: {
            ...guarded().answerGuard!,
            answersFingerprint: fingerprintAnswers(['something else']),
          },
        };
        expect(turnsOf(answer(openWith(forged), 'روكستر'))[0]).toMatchObject({
          correct: false,
        });
      });
    });

    it('leaves the clock running out exactly as it was', () => {
      withTolerance(() => {
        const next = send(
          MARHALA_COMMANDS.expireQuestion,
          openWith(guarded()),
        ).runtimeState;
        expect(turnsOf(next)[0]).toMatchObject({
          correct: false,
          resolvedBy: 'timeout',
        });
        expect(positionsOf(next)[TEAM_A]).toBe(MARHALA_START_POSITION);
      });
    });

    it('never projects the guard or the answers to anyone', () => {
      const open = openWith(guarded(['روكستال']));
      const views = [
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState(open),
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(open, {
          kind: 'participant',
          participantId: 'player-a',
          teamId: TEAM_A,
        } as never),
      ];
      for (const view of views) {
        const wire = JSON.stringify(view);
        expect(wire).not.toContain('answerGuard');
        expect(wire).not.toContain('روكستال');
        expect(wire).not.toContain('روكستار');
        expect(wire).not.toContain(guarded().answerGuard!.answersFingerprint);
      }
    });
  });

  /**
   * One phone carries each turn.
   *
   * The lobby captain while connected, otherwise the team's whole roster in
   * turn. The holder elects the band and answers; a teammate is refused, the
   * other team still hears "not your turn", and the race itself — movement,
   * deadline, scoring — is untouched.
   */
  describe('the turn holder', () => {
    const TEAMS_ROSTER = [
      { participantId: 'a1', teamId: TEAM_A, connected: true },
      { participantId: 'a2', teamId: TEAM_A, connected: true },
      { participantId: 'b1', teamId: TEAM_B, connected: true },
      { participantId: 'b2', teamId: TEAM_B, connected: true },
    ];

    const assigned = (
      captains: Record<string, string> = {},
      roster = TEAMS_ROSTER,
    ) =>
      runtime({
        teamActionJson: serializeTeamActionAssignments(
          assignNextTeamActionOrHold(
            createTeamActionAssignmentState(
              buildTeamRotations({
                teams: [TEAM_A, TEAM_B],
                participants: roster,
                randomIndex: () => 0,
                captains,
              }),
            ),
            {
              teamId: TEAM_A,
              action: MARHALA_TURN_ACTION,
              participants: roster,
              now: NOW,
            },
          ).state,
        ),
      });

    const as = (
      type: string,
      state: GameplayModeState,
      submitter: string,
      payload: GameplayModeState = {},
      roster = TEAMS_ROSTER,
    ) =>
      MARHALA_GAMEPLAY_PLUGIN.handleCommand(
        {
          sessionId: 's1',
          runtimeId: 'runtime-1',
          now: NOW,
          eligibleParticipants: roster,
          ...(submitter ? { submitterParticipantId: submitter } : {}),
          ...(type === MARHALA_COMMANDS.openQuestion
            ? { serverOwnedCommand: true }
            : {}),
        },
        {
          type,
          payload,
          runtimeState:
            type === MARHALA_COMMANDS.expireQuestion && !state.deadlineAt
              ? { ...state, deadlineAt: '2026-08-20T11:59:00.000Z' }
              : state,
          roundState: { phase: state.phase },
        },
      ).runtimeState;

    const holderOf = (state: GameplayModeState) =>
      parseTeamActionAssignments(state.teamActionJson).assignments.find(
        (assignment) => assignment.action === MARHALA_TURN_ACTION,
      );

    /** The holder plays a whole turn and gets it wrong. */
    const playWrong = (state: GameplayModeState, holder: string) => {
      const chosen = as(MARHALA_COMMANDS.chooseDifficulty, state, holder, {
        difficulty: 'easy',
      });
      const open = as(MARHALA_COMMANDS.openQuestion, chosen, '', {
        questionJson: JSON.stringify(question('easy')),
      });
      return as(MARHALA_COMMANDS.submitAnswer, open, holder, {
        answer: 'خطأ',
      });
    };

    it('refuses a teammate who does not hold the turn', () => {
      expect(() =>
        as(MARHALA_COMMANDS.chooseDifficulty, assigned(), 'a2', {
          difficulty: 'easy',
        }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
    });

    it('still tells the other team it is not their turn', () => {
      expect(() =>
        as(MARHALA_COMMANDS.chooseDifficulty, assigned(), 'b1', {
          difficulty: 'easy',
        }),
      ).toThrow(expect.objectContaining({ code: 'MARHALA_NOT_YOUR_TURN' }));
    });

    it('refuses the answer from a teammate after the holder elected', () => {
      const chosen = as(MARHALA_COMMANDS.chooseDifficulty, assigned(), 'a1', {
        difficulty: 'easy',
      });
      const open = as(MARHALA_COMMANDS.openQuestion, chosen, '', {
        questionJson: JSON.stringify(question('easy')),
      });
      expect(() =>
        as(MARHALA_COMMANDS.submitAnswer, open, 'a2', { answer: 'روكستار' }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
      // The holder's answer moves the token exactly as before.
      const moved = as(MARHALA_COMMANDS.submitAnswer, open, 'a1', {
        answer: 'روكستار',
      });
      expect(turnsOf(moved)).toHaveLength(1);
      expect(turnsOf(moved)[0]).toMatchObject({
        correct: true,
        teamId: TEAM_A,
      });
      expect(positionsOf(moved)[TEAM_A]).toBeGreaterThan(
        MARHALA_START_POSITION,
      );
    });

    it('refuses a stale assignment sequence', () => {
      const state = assigned();
      const sequence = holderOf(state)!.sequence;
      expect(() =>
        as(MARHALA_COMMANDS.chooseDifficulty, state, 'a1', {
          difficulty: 'easy',
          assignmentSequence: sequence - 1,
        }),
      ).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_STALE_ASSIGNMENT' }),
      );
      expect(
        as(MARHALA_COMMANDS.chooseDifficulty, state, 'a1', {
          difficulty: 'easy',
          assignmentSequence: sequence,
        }).phase,
      ).toBe('question-pending');
    });

    it('rotates over the whole roster turn by turn when there is no captain', () => {
      let state = assigned();
      const holders: string[] = [];
      for (let turn = 0; turn < 4; turn += 1) {
        const holder = holderOf(state)!.participantId;
        holders.push(holder);
        state = playWrong(state, holder);
      }
      expect(holders).toEqual(['a1', 'b1', 'a2', 'b2']);
    });

    it('gives the captain every one of the team’s turns', () => {
      let state = assigned({ [TEAM_A]: 'a2', [TEAM_B]: 'b2' });
      const holders: string[] = [];
      for (let turn = 0; turn < 4; turn += 1) {
        const holder = holderOf(state)!.participantId;
        holders.push(holder);
        state = playWrong(state, holder);
      }
      expect(holders).toEqual(['a2', 'b2', 'a2', 'b2']);
    });

    it('hands the next turn to a stand-in while the captain is away', () => {
      const awayB2 = TEAMS_ROSTER.map((entry) =>
        entry.participantId === 'b2' ? { ...entry, connected: false } : entry,
      );
      const state = assigned({ [TEAM_B]: 'b2' }, awayB2);
      const chosen = as(
        MARHALA_COMMANDS.chooseDifficulty,
        state,
        'a1',
        {
          difficulty: 'easy',
        },
        awayB2,
      );
      const open = as(
        MARHALA_COMMANDS.openQuestion,
        chosen,
        '',
        {
          questionJson: JSON.stringify(question('easy')),
        },
        awayB2,
      );
      const passed = as(
        MARHALA_COMMANDS.submitAnswer,
        open,
        'a1',
        {
          answer: 'خطأ',
        },
        awayB2,
      );
      expect(holderOf(passed)).toMatchObject({
        teamId: TEAM_B,
        participantId: 'b1',
      });
    });

    it('opens the next turn on expiry too, without touching the deadline rule', () => {
      const chosen = as(MARHALA_COMMANDS.chooseDifficulty, assigned(), 'a1', {
        difficulty: 'easy',
      });
      const open = as(MARHALA_COMMANDS.openQuestion, chosen, '', {
        questionJson: JSON.stringify(question('easy')),
      });
      const expired = as(MARHALA_COMMANDS.expireQuestion, open, '');
      expect(turnsOf(expired)[0]).toMatchObject({ resolvedBy: 'timeout' });
      expect(holderOf(expired)).toMatchObject({
        teamId: TEAM_B,
        participantId: 'b1',
      });
    });

    it('holds the turn for a team that is wholly away', () => {
      const bAway = TEAMS_ROSTER.map((entry) =>
        entry.teamId === TEAM_B ? { ...entry, connected: false } : entry,
      );
      const chosen = as(
        MARHALA_COMMANDS.chooseDifficulty,
        assigned(),
        'a1',
        {
          difficulty: 'easy',
        },
        bAway,
      );
      const open = as(
        MARHALA_COMMANDS.openQuestion,
        chosen,
        '',
        {
          questionJson: JSON.stringify(question('easy')),
        },
        bAway,
      );
      const passed = as(
        MARHALA_COMMANDS.submitAnswer,
        open,
        'a1',
        {
          answer: 'خطأ',
        },
        bAway,
      );
      expect(marhalaActiveTeamId(passed)).toBe(TEAM_B);
      expect(holderOf(passed)).toMatchObject({
        teamId: TEAM_B,
        participantId: 'b1',
      });
    });

    it('closes the turn when the race ends', () => {
      const state = runtime({
        ...assigned(),
        positionsJson: JSON.stringify({
          [TEAM_A]: MARHALA_FINISH_POSITION - 1,
          [TEAM_B]: MARHALA_START_POSITION,
        }),
      });
      const chosen = as(MARHALA_COMMANDS.chooseDifficulty, state, 'a1', {
        difficulty: 'easy',
      });
      const open = as(MARHALA_COMMANDS.openQuestion, chosen, '', {
        questionJson: JSON.stringify(question('easy')),
      });
      const won = as(MARHALA_COMMANDS.submitAnswer, open, 'a1', {
        answer: 'روكستار',
      });
      expect(won.phase).toBe('completed');
      expect(holderOf(won)).toBeUndefined();
    });

    it('shows everyone who holds the turn, and only the holder that it is theirs', () => {
      const state = assigned({ [TEAM_A]: 'a2' });
      const shared = MARHALA_GAMEPLAY_PLUGIN.projectRuntimeState!(state);
      expect(shared.assignedParticipantId).toBe('a2');
      expect(shared.teamActionJson).toBeUndefined();
      const project = (participantId: string, teamId: string) =>
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(state, {
          controller: false,
          participantId,
          teamId,
        });
      expect(project('a2', TEAM_A)).toMatchObject({
        isActiveTeam: true,
        isAssignedActor: true,
        ownAssignmentSequence: holderOf(state)!.sequence,
      });
      expect(project('a1', TEAM_A)).toMatchObject({
        isActiveTeam: true,
        isAssignedActor: false,
      });
      expect(project('a1', TEAM_A).ownAssignmentSequence).toBeUndefined();
      expect(project('b1', TEAM_B)).toMatchObject({
        isActiveTeam: false,
        isAssignedActor: false,
      });
    });

    it('keeps the team-wide rule for a race started before turns were assigned', () => {
      const legacy = runtime();
      expect(
        as(
          MARHALA_COMMANDS.chooseDifficulty,
          legacy,
          'a2',
          {
            difficulty: 'easy',
          },
          TEAMS_ROSTER,
        ).phase,
      ).toBe('question-pending');
      expect(
        MARHALA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(legacy, {
          controller: false,
          participantId: 'a2',
          teamId: TEAM_A,
        }).isAssignedActor,
      ).toBe(true);
    });
  });
});
