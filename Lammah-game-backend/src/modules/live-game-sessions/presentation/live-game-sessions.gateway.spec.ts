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

  function setup() {
    const getSession = { execute: jest.fn().mockResolvedValue(snapshot) };
    const markReady = { execute: jest.fn().mockResolvedValue(snapshot) };
    const noOp = { execute: jest.fn().mockResolvedValue(snapshot) };
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
      } as never,
      { authenticate: jest.fn() } as never,
      noOp as never,
      noOp as never,
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
    return { gateway, client, getSession, markReady };
  }

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
