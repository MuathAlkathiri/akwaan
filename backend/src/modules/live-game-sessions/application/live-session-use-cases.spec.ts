import {
  CORE_TIMED_TURNS_MODE,
  LiveGameModeRegistry,
} from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import { LiveGameSessionRepository } from '../domain/live-game-session.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { CreateLiveGameSession } from './create-live-game-session.use-case';
import { GetLiveGameSession } from './get-live-game-session.use-case';
import { LiveSessionCommandExecutor } from './live-session-command.base';
import {
  MarkSessionReady,
  PauseLiveGameSession,
  ResumeLiveGameSession,
  StartLiveGameSession,
} from './live-session-lifecycle.use-cases';
import { LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { LiveSessionTransitionPublisher } from './live-session-transition.publisher';
import { StartTeamTurn, SwitchActiveTeam } from './live-session-turn.use-cases';

class MemoryRepository implements LiveGameSessionRepository {
  session?: LiveGameSession;
  persistedRevision?: number;
  async create(session: LiveGameSession) {
    this.session = session;
    this.persistedRevision = session.revision;
  }
  async findById() {
    return this.session ?? null;
  }
  async findByParentQuestion() {
    return this.session ?? null;
  }
  async save(session: LiveGameSession, expectedRevision: number) {
    if (!this.session || this.persistedRevision !== expectedRevision) {
      throw new LiveSessionConcurrencyError();
    }
    this.session = session;
    this.persistedRevision = session.revision;
  }
}

describe('live session application use cases', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const actor = { id: 'host', fullName: 'Host' } as never;
  let repository: MemoryRepository;
  let createSession: CreateLiveGameSession;
  let getSession: GetLiveGameSession;
  let executor: LiveSessionCommandExecutor;
  let published: string[];

  beforeEach(() => {
    repository = new MemoryRepository();
    const clock: LiveSessionClock = { now: () => now };
    const snapshots = new LiveGameSessionSnapshotMapper();
    published = [];
    const publisher: LiveSessionTransitionPublisher = {
      publish: (event) => published.push(event),
      publishEvent: (event) => published.push(event),
    };
    createSession = new CreateLiveGameSession(
      repository,
      clock,
      new LiveGameModeRegistry(),
      snapshots,
      {
        assertAccessible: jest.fn(),
        gameplaySetup: jest.fn().mockResolvedValue({
          sessionModeKey: 'core-timed-turns',
          sessionModeVersion: 1,
          runtimeModeKey: 'core-round-runtime',
          runtimeModeVersion: 1,
        }),
        markQuestionStarted: jest.fn(),
        finalizeBombQuestion: jest.fn(),
      },
    );
    getSession = new GetLiveGameSession(repository, clock, {
      compose: (
        session: LiveGameSession,
        actor: { actorId: string },
        now: Date,
      ) => Promise.resolve(snapshots.toSnapshot(session, actor.actorId, now)),
    } as never);
    executor = new LiveSessionCommandExecutor(
      repository,
      clock,
      snapshots,
      publisher,
    );
  });

  it('creates and recovers a safe authoritative snapshot', async () => {
    const created = await createSession.execute({
      actor,
      modeKey: CORE_TIMED_TURNS_MODE.key,
      modeVersion: CORE_TIMED_TURNS_MODE.version,
      teamNames: ['One', 'Two'],
    });
    const recovered = await getSession.execute(
      created.snapshot.sessionId,
      'host',
    );
    expect(created.reconnectToken).toHaveLength(43);
    expect(recovered.teams).toHaveLength(2);
    expect(JSON.stringify(recovered)).not.toContain(created.reconnectToken);
  });

  it('starts, pauses, resumes, and switches through focused handlers', async () => {
    const created = await createSession.execute({
      actor,
      modeKey: CORE_TIMED_TURNS_MODE.key,
      modeVersion: 1,
      teamNames: ['One', 'Two'],
    });
    const base = {
      sessionId: created.snapshot.sessionId,
      actorId: 'host',
    };
    const ready = await new MarkSessionReady(executor).execute({
      ...base,
      expectedRevision: 0,
      commandId: '00000000-0000-4000-8000-000000000001',
    });
    const active = await new StartLiveGameSession(executor, {
      assertAccessible: jest.fn(),
      gameplaySetup: jest.fn(),
      markQuestionStarted: jest.fn(),
      finalizeBombQuestion: jest.fn(),
    }).execute({
      ...base,
      expectedRevision: ready.revision,
      commandId: '00000000-0000-4000-8000-000000000002',
    });
    const turned = await new StartTeamTurn(executor).execute({
      ...base,
      expectedRevision: active.revision,
      commandId: '00000000-0000-4000-8000-000000000003',
      teamId: active.teams[0].id,
      reason: 'initial',
    });
    const switched = await new SwitchActiveTeam(executor).execute({
      ...base,
      expectedRevision: turned.revision,
      commandId: '00000000-0000-4000-8000-000000000004',
      teamId: active.teams[1].id,
      reason: 'manual',
    });
    const paused = await new PauseLiveGameSession(executor).execute({
      ...base,
      expectedRevision: switched.revision,
      commandId: '00000000-0000-4000-8000-000000000005',
    });
    const resumed = await new ResumeLiveGameSession(executor).execute({
      ...base,
      expectedRevision: paused.revision,
      commandId: '00000000-0000-4000-8000-000000000006',
    });
    expect(resumed.status).toBe('active');
    expect(resumed.activeTeamId).toBe(active.teams[1].id);
    expect(published).toHaveLength(6);
  });

  it('rejects unauthorized and stale commands and ignores duplicates', async () => {
    const created = await createSession.execute({
      actor,
      modeKey: CORE_TIMED_TURNS_MODE.key,
      modeVersion: 1,
      teamNames: ['One', 'Two'],
    });
    const ready = new MarkSessionReady(executor);
    await expect(
      ready.execute({
        sessionId: created.snapshot.sessionId,
        actorId: 'observer',
        expectedRevision: 0,
        commandId: '00000000-0000-4000-8000-000000000007',
      }),
    ).rejects.toMatchObject({ code: 'SESSION_FORBIDDEN' });
    const command = {
      sessionId: created.snapshot.sessionId,
      actorId: 'host',
      expectedRevision: 0,
      commandId: '00000000-0000-4000-8000-000000000008',
    };
    const first = await ready.execute(command);
    const duplicate = await ready.execute(command);
    expect(duplicate.revision).toBe(first.revision);
    await expect(
      new StartLiveGameSession(executor, {
        assertAccessible: jest.fn(),
        gameplaySetup: jest.fn(),
        markQuestionStarted: jest.fn(),
        finalizeBombQuestion: jest.fn(),
      }).execute({
        ...command,
        commandId: '00000000-0000-4000-8000-000000000009',
      }),
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });
});
