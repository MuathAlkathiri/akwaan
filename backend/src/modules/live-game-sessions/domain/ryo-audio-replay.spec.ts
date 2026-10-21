import {
  RYO_GAMEPLAY_PLUGIN,
  RYO_REPLAY_COOLDOWN_SECONDS,
} from './ryo-gameplay.plugin';
import type { GameplayPluginContext } from './gameplay-mode.plugin';

/**
 * Server-authoritative audio replay.
 *
 * Replay is a presentation signal, not a lifecycle event: these assert both
 * that it is authorised correctly and — more importantly — that an accepted
 * replay leaves every scored and timed field exactly as it found it.
 */
describe('RYO audio replay', () => {
  const T0 = new Date('2026-01-01T00:00:00Z');
  const AUDIO = { type: 'audio', url: 'https://cdn/x.mp3' };

  const teamActionJson = JSON.stringify({
    rotations: [
      { teamId: 'a', order: ['p'], cursor: 0 },
      { teamId: 'b', order: ['q'], cursor: 0 },
    ],
    assignments: [
      { teamId: 'a', participantId: 'p', action: 'ryo.answer', sequence: 1 },
      { teamId: 'b', participantId: 'q', action: 'ryo.decision', sequence: 2 },
    ],
    nextSequence: 3,
  });

  const runtimeState = (media: unknown = AUDIO) => ({
    teamActionJson,
    // Exactly three — the RYO runtime invariant.
    itemsJson: JSON.stringify([
      { id: 'i0', prompt: 'س', correctOptionId: 'x', media },
      { id: 'i1', prompt: 'س', correctOptionId: 'x', media },
      { id: 'i2', prompt: 'س', correctOptionId: 'x', media },
    ]),
    teamIdsJson: JSON.stringify(['a', 'b']),
    startingTeamId: 'a',
    currentItemIndex: 0,
  });

  const roundState = (over: Record<string, unknown> = {}) => ({
    phase: 'collecting',
    itemIndex: 0,
    answeringTeamId: 'a',
    opposingTeamId: 'b',
    ...over,
  });

  interface RunOptions {
    round?: Record<string, unknown>;
    media?: unknown;
    now?: Date;
    deadline?: Date;
    itemIndex?: number;
    awaiting?: boolean;
  }

  const run = (over: RunOptions = {}) =>
    RYO_GAMEPLAY_PLUGIN.handleCommand(
      {
        sessionId: 's',
        runtimeId: 'r',
        now: over.now ?? T0,
        ...(over.awaiting ? { awaitingPresentationActivation: true } : {}),
        ...(over.deadline ? { interactionDeadlineAt: over.deadline } : {}),
      } as GameplayPluginContext,
      {
        type: 'request-ryo-replay',
        payload: { itemIndex: over.itemIndex ?? 0 },
        runtimeState: runtimeState('media' in over ? over.media : AUDIO),
        roundState: roundState(over.round),
      },
    );

  /** The stable error *code*, which is what clients match on. */
  const refusal = (act: () => unknown): string => {
    try {
      act();
    } catch (error) {
      return (error as { code: string }).code;
    }
    throw new Error('expected a refusal, but the command was accepted');
  };

  const definition = RYO_GAMEPLAY_PLUGIN.command('request-ryo-replay');

  describe('authorization surface', () => {
    it('admits the host or any connected team player, not just the active one', () => {
      expect(definition!.authorization).toBe('controller-or-connected-player');
    });

    it('is unavailable outside an active round', () => {
      expect(definition!.allowedRoundStatuses).toEqual(['active']);
    });

    it('declares no other mode command', () => {
      expect(RYO_GAMEPLAY_PLUGIN.command('advance-phase')).toBeUndefined();
      expect(RYO_GAMEPLAY_PLUGIN.command('submit-ekshifni')).toBeUndefined();
    });

    it('requires the request to name its item', () => {
      expect(refusal(() => definition!.validatePayload({} as never))).toBe(
        'INVALID_GAMEPLAY_COMMAND',
      );
      expect(definition!.validatePayload({ itemIndex: 2 } as never)).toEqual({
        itemIndex: 2,
      });
    });
  });

  describe('eligibility', () => {
    it('accepts a replay while the item is collecting', () => {
      const result = run();
      expect(result.roundState.audioReplaySequence).toBe(1);
      expect(result.eventType).toBe('ryo-audio-replay');
    });

    it.each(['intro', 'resolved', 'between_items', 'completed'])(
      'refuses a replay in %s',
      (phase) => {
        expect(refusal(() => run({ round: { phase } }))).toBe(
          'RYO_REPLAY_UNAVAILABLE',
        );
      },
    );

    it('refuses a stale item, so a late request cannot restart the next clip', () => {
      expect(
        refusal(() => run({ round: { itemIndex: 1 }, itemIndex: 0 })),
      ).toBe('RYO_REPLAY_STALE_ITEM');
    });

    it('refuses a text-only question', () => {
      expect(refusal(() => run({ media: null }))).toBe('RYO_REPLAY_NO_AUDIO');
    });

    it('refuses media carrying no url', () => {
      expect(refusal(() => run({ media: { type: 'audio' } }))).toBe(
        'RYO_REPLAY_NO_AUDIO',
      );
    });

    it('refuses once the authoritative deadline has passed', () => {
      expect(
        refusal(() =>
          run({
            deadline: new Date(T0.getTime() + 1000),
            now: new Date(T0.getTime() + 1001),
          }),
        ),
      ).toBe('RYO_REPLAY_WINDOW_CLOSED');
    });

    it('still accepts a replay just inside the deadline', () => {
      const result = run({
        deadline: new Date(T0.getTime() + 1000),
        now: new Date(T0.getTime() + 999),
      });
      expect(result.roundState.audioReplaySequence).toBe(1);
    });
  });

  describe('held presentations', () => {
    it('refuses a replay while the item is still behind its readiness barrier', () => {
      // Nothing is being presented yet, so there is nothing to replay — and
      // accepting one would spend the shared cooldown before the question had
      // even opened, so the first genuine request would be refused.
      expect(refusal(() => run({ awaiting: true }))).toBe(
        'RYO_REPLAY_UNAVAILABLE',
      );
    });

    it('accepts one once the barrier has released', () => {
      expect(run({ awaiting: false }).eventType).toBe('ryo-audio-replay');
    });
  });

  describe('shared cooldown', () => {
    const justReplayed = {
      audioReplaySequence: 1,
      audioReplayAt: T0.toISOString(),
      audioReplayItemIndex: 0,
    };

    it('refuses a second replay inside the window', () => {
      expect(
        refusal(() =>
          run({
            round: justReplayed,
            now: new Date(
              T0.getTime() + RYO_REPLAY_COOLDOWN_SECONDS * 1000 - 1,
            ),
          }),
        ),
      ).toBe('RYO_REPLAY_COOLDOWN');
    });

    it('is shared, not per-actor — a different asker is refused too', () => {
      // The cooldown lives in round state, so who asks makes no difference.
      expect(
        refusal(() =>
          run({ round: justReplayed, now: new Date(T0.getTime() + 500) }),
        ),
      ).toBe('RYO_REPLAY_COOLDOWN');
    });

    it('allows another replay once the window has passed', () => {
      const result = run({
        round: justReplayed,
        now: new Date(T0.getTime() + RYO_REPLAY_COOLDOWN_SECONDS * 1000),
      });
      expect(result.roundState.audioReplaySequence).toBe(2);
    });

    it('restarts the sequence on a new item', () => {
      const result = run({
        round: { ...justReplayed, itemIndex: 1, audioReplayItemIndex: 0 },
        itemIndex: 1,
      });
      expect(result.roundState.audioReplaySequence).toBe(1);
      expect(result.roundState.audioReplayItemIndex).toBe(1);
    });

    it('does not carry a previous item cooldown into a new item', () => {
      const result = run({
        round: { ...justReplayed, itemIndex: 1, audioReplayItemIndex: 0 },
        itemIndex: 1,
        now: new Date(T0.getTime() + 1),
      });
      expect(result.roundState.audioReplaySequence).toBe(1);
    });

    it('survives reload — the cooldown is read from persisted state', () => {
      // Nothing is held in process memory, so the same persisted round state
      // yields the same decision after any restart or reconnect.
      const persisted: RunOptions = {
        round: justReplayed,
        now: new Date(T0.getTime() + 500),
      };
      expect(refusal(() => run(persisted))).toBe('RYO_REPLAY_COOLDOWN');
      expect(refusal(() => run(persisted))).toBe('RYO_REPLAY_COOLDOWN');
    });
  });

  describe('invariants', () => {
    it('changes nothing but the three replay fields', () => {
      const before = roundState();
      const after = run().roundState;
      expect(after.phase).toBe(before.phase);
      expect(after.itemIndex).toBe(before.itemIndex);
      expect(after.answeringTeamId).toBe(before.answeringTeamId);
      expect(after.opposingTeamId).toBe(before.opposingTeamId);
      expect(
        Object.keys(after)
          .filter((key) => !(key in before))
          .sort(),
      ).toEqual([
        'audioReplayAt',
        'audioReplayItemIndex',
        'audioReplaySequence',
      ]);
    });

    it('returns the runtime state untouched and raises no session effects', () => {
      const result = run();
      expect(result.runtimeState).toEqual(runtimeState());
      expect(result.effects).toEqual([]);
      // Never asks the aggregate to re-open a Fair-Start checkpoint.
      expect(result.prepareNextPresentation).toBeUndefined();
    });

    it('writes nothing when the request is refused', () => {
      // A refusal throws before any field is built, so the transaction commits
      // nothing and the use case has nothing to publish.
      const snapshot = JSON.stringify(roundState());
      expect(refusal(() => run({ round: { phase: 'resolved' } }))).toBe(
        'RYO_REPLAY_UNAVAILABLE',
      );
      expect(JSON.stringify(roundState())).toBe(snapshot);
    });

    it('carries only item identity and ordering in its event', () => {
      const payload = run().eventPayload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'audioReplayAt',
        'audioReplayItemIndex',
        'audioReplaySequence',
      ]);
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain('cdn');
      expect(serialized).not.toContain('correctOptionId');
    });

    it('refuses any other mode command, as before', () => {
      expect(
        refusal(() =>
          RYO_GAMEPLAY_PLUGIN.handleCommand(
            {
              sessionId: 's',
              runtimeId: 'r',
              now: T0,
            } as GameplayPluginContext,
            {
              type: 'advance-phase',
              payload: {},
              runtimeState: runtimeState(),
              roundState: roundState(),
            },
          ),
        ),
      ).toBe('MODE_COMMAND_UNAVAILABLE');
    });
  });
});
