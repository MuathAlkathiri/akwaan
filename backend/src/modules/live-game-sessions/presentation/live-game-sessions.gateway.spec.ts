import { LiveGameSessionsGateway } from './live-game-sessions.gateway';
import { validate } from 'class-validator';
import { LiveSessionSocketMutationDto } from './live-game-session.dto';

describe('LiveGameSessionsGateway', () => {
  const snapshot = {
    sessionId: '00000000-0000-4000-8000-000000000001',
    revision: 1,
    participants: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        role: 'controller',
      },
    ],
  };

  /**
   * A snapshot with the bulk a real one carries.
   *
   * The acknowledgement assertions below are about size as much as shape, so a
   * three-field stub would prove nothing: it would serialize to roughly what
   * the trimmed acknowledgement does.
   */
  const gameplaySnapshot = {
    ...snapshot,
    revision: 7,
    gameplay: {
      revision: 12,
      activeRound: {
        id: '00000000-0000-4000-8000-000000000020',
        interaction: { revision: 3, submissions: [] },
      },
      transitions: Array.from({ length: 24 }, (_, index) => ({
        type: 'interaction-resolved',
        at: '2026-08-16T00:00:00.000Z',
        index,
      })),
    },
    match: {
      id: '00000000-0000-4000-8000-000000000030',
      revision: 9,
      challengeHistory: Array.from({ length: 6 }, (_, index) => ({
        id: `result-${index}`,
        matchPoints: [{ teamId: 'team-a', points: 1 }],
      })),
    },
  };

  function setup() {
    const getSession = { execute: jest.fn().mockResolvedValue(snapshot) };
    const markReady = { execute: jest.fn().mockResolvedValue(snapshot) };
    const noOp = { execute: jest.fn().mockResolvedValue(snapshot) };
    const gameplay = {
      submit: jest.fn().mockResolvedValue(gameplaySnapshot),
      cancel: jest.fn().mockResolvedValue(gameplaySnapshot),
    };
    const gateway = new LiveGameSessionsGateway(
      { verifyAsync: jest.fn() } as never,
      { findById: jest.fn() } as never,
      { attach: jest.fn(), publishEvent: jest.fn() } as never,
      getSession as never,
      markReady as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      noOp as never,
      {
        connected: jest.fn().mockResolvedValue(true),
        disconnected: jest.fn(),
        heartbeat: jest.fn().mockResolvedValue(undefined),
      } as never,
      { authenticate: jest.fn() } as never,
      noOp as never,
      gameplay as never,
      noOp as never,
    );
    const client = {
      data: {
        actor: { kind: 'user', actorId: 'actor-1' },
        subscribedParticipants: new Map<string, string>(),
        commandTimestamps: [],
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn(),
      emit: jest.fn(),
    };
    return { gateway, client, getSession, markReady, gameplay };
  }

  const command = {
    sessionId: snapshot.sessionId,
    commandId: '00000000-0000-4000-8000-000000000002',
    expectedSessionRevision: 7,
    expectedRuntimeRevision: 12,
  };

  it('authorizes before joining a session room and emits recovery snapshot', async () => {
    const { gateway, client, getSession } = setup();
    await gateway.subscribe(client as never, {
      sessionId: snapshot.sessionId,
    });
    expect(getSession.execute).toHaveBeenCalledWith(snapshot.sessionId, {
      kind: 'user',
      actorId: 'actor-1',
    });
    expect(client.join).toHaveBeenCalledWith(
      `live-session:${snapshot.sessionId}`,
    );
    expect(client.emit).toHaveBeenCalledWith('live-session:snapshot', snapshot);
  });

  it('takes actor identity from the authenticated socket for mutations', async () => {
    const { gateway, client, markReady } = setup();
    await gateway.ready(client as never, {
      sessionId: snapshot.sessionId,
      commandId: '00000000-0000-4000-8000-000000000002',
      expectedRevision: 1,
    });
    expect(markReady.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor-1' }),
    );
  });

  it('emits a typed error rather than joining when subscription is rejected', async () => {
    const { gateway, client, getSession } = setup();
    getSession.execute.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { code: 'SESSION_FORBIDDEN' }),
    );
    await gateway.subscribe(client as never, {
      sessionId: snapshot.sessionId,
    });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('live-session:error', {
      code: 'SESSION_FORBIDDEN',
      message: 'Forbidden',
    });
  });

  describe('command acknowledgements', () => {
    /**
     * The command sender used to receive the whole authoritative snapshot
     * twice: once on `live-session:snapshot`, which it adopts, and once as the
     * acknowledgement, which it reads only for an error code. These pin the
     * second copy shut without touching the first.
     */

    it('acknowledges a gameplay command without returning the snapshot', async () => {
      const { gateway, client } = setup();

      const ack = await gateway.gameplayCommand(
        client as never,
        {
          ...command,
          commandType: 'answer',
        } as never,
      );

      expect(ack).toEqual({
        ok: true,
        sessionId: snapshot.sessionId,
        revision: 7,
        runtimeRevision: 12,
      });
      // The parts a client would have had to read the snapshot for are absent.
      expect(ack).not.toHaveProperty('gameplay');
      expect(ack).not.toHaveProperty('match');
      expect(ack).not.toHaveProperty('participants');
    });

    it('still delivers the full authoritative snapshot to the sender', async () => {
      // The trimmed acknowledgement must not cost the sender its state, and
      // must not push it onto an extra resync to get it back.
      const { gateway, client } = setup();

      await gateway.gameplayCommand(
        client as never,
        {
          ...command,
          commandType: 'answer',
        } as never,
      );

      expect(client.emit).toHaveBeenCalledWith(
        'live-session:snapshot',
        gameplaySnapshot,
      );
      expect(client.emit).toHaveBeenCalledTimes(1);
    });

    it('sends materially fewer bytes than the snapshot it replaces', async () => {
      const { gateway, client } = setup();

      const ack = await gateway.gameplayCommand(
        client as never,
        {
          ...command,
          commandType: 'answer',
        } as never,
      );

      const ackBytes = JSON.stringify(ack).length;
      const snapshotBytes = JSON.stringify(gameplaySnapshot).length;
      expect(ackBytes).toBeLessThan(snapshotBytes / 10);
    });

    it('acknowledges a session command without returning the snapshot', async () => {
      const { gateway, client } = setup();

      const ack = await gateway.ready(client as never, {
        sessionId: snapshot.sessionId,
        commandId: command.commandId,
        expectedRevision: 1,
      });

      expect(ack).toEqual({
        ok: true,
        sessionId: snapshot.sessionId,
        revision: 1,
      });
    });

    it('leaves the stale-revision failure acknowledgement untouched', async () => {
      // The client's retry keys on this exact shape. A command refused for a
      // stale revision is the normal case when two players answer together, so
      // changing it would silently drop the second player's press.
      const { gateway, client, gameplay } = setup();
      gameplay.submit.mockRejectedValue(
        Object.assign(new Error('Runtime revision is stale'), {
          code: 'STALE_RUNTIME_REVISION',
        }),
      );

      const ack = await gateway.gameplayCommand(
        client as never,
        {
          ...command,
          commandType: 'answer',
        } as never,
      );

      expect(ack).toEqual({
        code: 'STALE_RUNTIME_REVISION',
        message: 'Runtime revision is stale',
      });
      expect(client.emit).toHaveBeenCalledWith('live-session:gameplay-error', {
        code: 'STALE_RUNTIME_REVISION',
        message: 'Runtime revision is stale',
      });
      expect(client.emit).not.toHaveBeenCalledWith(
        'live-session:snapshot',
        expect.anything(),
      );
    });

    it('acknowledges an abort the same way, and still publishes the snapshot', async () => {
      const { gateway, client } = setup();

      const ack = await gateway.runtimeCancel(
        client as never,
        {
          sessionId: snapshot.sessionId,
          commandId: command.commandId,
          expectedSessionRevision: 7,
          expectedRuntimeRevision: 12,
        } as never,
      );

      expect(ack).toEqual({
        ok: true,
        sessionId: snapshot.sessionId,
        revision: 7,
        runtimeRevision: 12,
      });
      expect(client.emit).toHaveBeenCalledWith(
        'live-session:snapshot',
        gameplaySnapshot,
      );
    });

    it('passes through a reply that was never a snapshot', async () => {
      // The heartbeat answers with a server timestamp. Narrowing must not
      // reshape a handler that already replies with something small.
      const { gateway, client } = setup();
      client.data.subscribedParticipants.set(
        snapshot.sessionId,
        '00000000-0000-4000-8000-000000000010',
      );

      const ack = (await gateway.participantHeartbeat(client as never, {
        sessionId: snapshot.sessionId,
      })) as { serverTimestamp?: string };

      expect(typeof ack.serverTimestamp).toBe('string');
    });
  });

  it('rejects malformed mutation commands at the gateway DTO boundary', async () => {
    const dto = Object.assign(new LiveSessionSocketMutationDto(), {
      sessionId: 'not-a-session-id',
      commandId: 'not-a-command-id',
      expectedRevision: -1,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'commandId',
      'expectedRevision',
      'sessionId',
    ]);
  });
});
