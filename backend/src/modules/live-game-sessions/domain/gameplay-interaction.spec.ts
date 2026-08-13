import { GameplayInteraction } from './gameplay-interaction';
import { CORE_ROUND_RUNTIME_PLUGIN } from './gameplay-mode.plugin';

describe('GameplayInteraction', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const prepare = (deadlineAt?: Date) =>
    GameplayInteraction.prepare({
      roundId: 'round-1',
      prompt: {
        type: 'development-signal',
        schemaVersion: 1,
        publicPayload: { message: 'Send a signal' },
        participantPayload: { message: 'Send a signal' },
        hostPayload: { message: 'Send a signal' },
        internalPayload: { secret: true },
        visibility: 'public',
        metadata: {},
        deadlineAt,
      },
      now,
    });

  it('enforces lifecycle, submission window, and terminal immutability', () => {
    const interaction = prepare();
    expect(() =>
      interaction.submit({
        participantId: 'player-1',
        teamId: 'team-1',
        type: 'development-signal',
        schemaVersion: 1,
        payload: { signal: 'ready' },
        requestId: 'request-1',
        resultVisibility: 'submitting-participant',
        now,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_INTERACTION_TRANSITION' }),
    );
    interaction.open(now);
    const submission = interaction.submit({
      participantId: 'player-1',
      teamId: 'team-1',
      type: 'development-signal',
      schemaVersion: 1,
      payload: { signal: 'ready' },
      requestId: 'request-1',
      resultVisibility: 'submitting-participant',
      now,
    });
    expect(
      interaction.submit({
        participantId: 'player-1',
        teamId: 'team-1',
        type: 'development-signal',
        schemaVersion: 1,
        payload: { signal: 'ready' },
        requestId: 'request-1',
        resultVisibility: 'submitting-participant',
        now,
      }).id,
    ).toBe(submission.id);
    interaction.close(now);
    interaction.adjudicate(submission.id, true, 'accepted', {}, now);
    const plugin = CORE_ROUND_RUNTIME_PLUGIN.interaction!;
    interaction.resolve(
      plugin.createOutcome(interaction.serialize().submissions, now).outcome,
      'resolve-1',
      now,
    );
    expect(interaction.serialize().status).toBe('resolved');
    expect(() => interaction.cancel(now)).toThrow(
      expect.objectContaining({ code: 'INVALID_INTERACTION_TRANSITION' }),
    );
  });

  it('uses persisted server deadlines and rejects late submissions', () => {
    const interaction = prepare(new Date(now.getTime() + 1_000));
    interaction.open(now);
    const late = new Date(now.getTime() + 1_001);
    expect(() =>
      interaction.submit({
        participantId: 'player-1',
        type: 'development-signal',
        schemaVersion: 1,
        payload: { signal: 'ready' },
        requestId: 'late',
        resultVisibility: 'submitting-participant',
        now: late,
      }),
    ).toThrow(expect.objectContaining({ code: 'INTERACTION_EXPIRED' }));
    interaction.expire(late);
    expect(interaction.serialize().status).toBe('expired');
  });

  it('bounds submissions, request IDs, and history', () => {
    const state = prepare().serialize();
    state.status = 'open';
    state.submissions = Array.from({ length: 120 }, (_, index) => ({
      id: `submission-${index}`,
      participantId: `player-${index}`,
      type: 'development-signal',
      schemaVersion: 1,
      payload: { signal: 'ready' },
      receivedAt: now,
      requestId: `request-${index}`,
      status: 'pending-adjudication',
      resultVisibility: 'submitting-participant',
    }));
    state.processedRequestIds = Array.from(
      { length: 120 },
      (_, index) => `request-${index}`,
    );
    state.history = Array.from({ length: 120 }, (_, index) => ({
      revision: index + 1,
      type: 'submission-received',
      timestamp: now,
    }));
    const interaction = GameplayInteraction.restore(state);
    interaction.submit({
      participantId: 'last-player',
      type: 'development-signal',
      schemaVersion: 1,
      payload: { signal: 'ready' },
      requestId: 'last-request',
      resultVisibility: 'submitting-participant',
      now,
    });
    expect(interaction.serialize()).toMatchObject({
      submissions: expect.arrayContaining([
        expect.objectContaining({ requestId: 'last-request' }),
      ]),
    });
    expect(interaction.serialize().submissions).toHaveLength(100);
    expect(interaction.serialize().processedRequestIds).toHaveLength(100);
    expect(interaction.serialize().history).toHaveLength(100);
  });
});
