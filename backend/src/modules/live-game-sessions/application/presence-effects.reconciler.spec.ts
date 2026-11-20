import { Logger } from '@nestjs/common';
import { PresenceEffectsReconciler } from './presence-effects.reconciler';
import {
  LiveSessionConcurrencyError,
  LiveSessionDomainError,
} from '../domain/live-session.errors';

function setup(input: {
  readinessIds?: string[];
  recurringIds?: string[];
  liveIds?: string[];
  session?: Record<string, unknown> | null;
}) {
  const presence = {
    connectionIds: jest.fn(async () => new Set(input.liveIds ?? [])),
  };
  const runtime = {
    serialize: () => ({
      presentationReady: (input.readinessIds ?? []).map((connectionId) => ({
        connectionId,
      })),
      currentPresentation: {
        readiness: (input.recurringIds ?? []).map((connectionId) => ({
          connectionId,
        })),
      },
    }),
  };
  const runtimes = { findBySessionId: jest.fn(async () => runtime) };
  const sessionAggregate =
    input.session === null
      ? null
      : {
          revision: 7,
          controllerActorId: 'host',
          serialize: () => input.session,
          cancelCountdown: jest.fn(),
          completeCommand: jest.fn(),
        };
  const sessions = {
    findById: jest.fn(async () => sessionAggregate),
    save: jest.fn(async () => undefined),
  };
  const publisher = { publish: jest.fn() };
  const reassign = { forSession: jest.fn(async () => undefined) };
  const withdraw = { forConnection: jest.fn(async () => undefined) };
  const reconciler = new PresenceEffectsReconciler(
    presence as never,
    { now: () => new Date('2026-11-07T00:00:00Z') } as never,
    sessions as never,
    runtimes as never,
    { toSnapshot: () => ({}) } as never,
    publisher as never,
    reassign as never,
    withdraw as never,
  );
  return {
    runtimes,
    reconciler,
    sessions,
    sessionAggregate,
    publisher,
    reassign,
    withdraw,
  };
}

/** A ready session whose representative's readiness and presence can vary. */
const readySession = (ready: boolean, connected: boolean) => ({
  modeKey: 'bomb',
  status: 'ready',
  teams: [{ id: 't1', active: true }],
  participants: [{ role: 'team-player', teamId: 't1', ready, connected }],
});

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('PresenceEffectsReconciler', () => {
  it('withdraws readiness held by connections no longer present (raw socket ids, any owner)', async () => {
    const t = setup({
      readinessIds: ['old-sock', 'live-sock'],
      recurringIds: ['old-recurring'],
      liveIds: ['live-sock'],
      session: {
        modeKey: 'core',
        status: 'running',
        teams: [],
        participants: [],
      },
    });
    await t.reconciler.forSession('s1');
    expect(t.withdraw.forConnection.mock.calls).toEqual([
      ['s1', 'old-sock'],
      ['s1', 'old-recurring'],
    ]);
  });



  it('runs every effect even when earlier ones fail (partial-failure recovery)', async () => {
    const t = setup({ readinessIds: ['gone'] });
    t.reassign.forSession.mockRejectedValueOnce(new Error('stale revision'));
    t.withdraw.forConnection.mockRejectedValueOnce(new Error('db down'));
    await expect(t.reconciler.forSession('s1')).resolves.toEqual({
      status: 'transient',
    });
    // The next pass retries what failed, derived from state again.
    await t.reconciler.forSession('s1');
    expect(t.reassign.forSession).toHaveBeenCalledTimes(2);
    expect(t.withdraw.forConnection).toHaveBeenCalledTimes(2);
  });


  describe('failure classification', () => {
    const invalid = () =>
      new LiveSessionDomainError(
        'INVALID_TEAM_ACTION_STATE',
        'Team action assignment state is missing',
      );

    it('is permanent only when the persisted runtime itself cannot be restored', async () => {
      const t = setup({ session: readySession(true, true) });
      t.runtimes.findBySessionId.mockRejectedValue(invalid());
      t.reassign.forSession.mockRejectedValue(invalid());
      await expect(t.reconciler.forSession('s1')).resolves.toEqual({
        status: 'permanent',
        code: 'INVALID_TEAM_ACTION_STATE',
        message: 'Team action assignment state is missing',
      });
    });

    it('is transient when an effect fails but the state restores (the failure lay elsewhere)', async () => {
      const t = setup({ session: readySession(true, true) });
      t.reassign.forSession.mockRejectedValueOnce(invalid());
      await expect(t.reconciler.forSession('s1')).resolves.toEqual({
        status: 'transient',
      });
    });

    it('is transient when the probe fails on the database', async () => {
      const t = setup({ session: readySession(true, true) });
      const network = Object.assign(new Error('connection reset'), {
        name: 'MongoNetworkError',
      });
      t.reassign.forSession.mockRejectedValueOnce(network);
      t.runtimes.findBySessionId.mockRejectedValue(network);
      await expect(t.reconciler.forSession('s1')).resolves.toEqual({
        status: 'transient',
      });
    });

    it('never treats a revision race as permanent, even if a load surfaced it', async () => {
      const t = setup({ session: readySession(true, true) });
      t.reassign.forSession.mockRejectedValueOnce(
        new LiveSessionConcurrencyError(),
      );
      t.runtimes.findBySessionId.mockRejectedValue(
        new LiveSessionConcurrencyError(),
      );
      await expect(t.reconciler.forSession('s1')).resolves.toEqual({
        status: 'transient',
      });
    });

    it('leaves an expired Bomb countdown alone instead of failing on it', async () => {
      const t = setup({
        session: {
          ...readySession(true, false),
          expiresAt: new Date('2026-11-06T00:00:00Z'),
        },
      });
      await expect(t.reconciler.forSession('s1')).resolves.toEqual({
        status: 'ok',
      });
      expect(t.sessions.save).not.toHaveBeenCalled();
      expect(t.publisher.publish).not.toHaveBeenCalled();
    });
  });
});
