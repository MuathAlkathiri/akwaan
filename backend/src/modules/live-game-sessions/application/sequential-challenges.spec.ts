import {
  CORE_TIMED_TURNS_MODE,
  LiveGameModeRegistry,
} from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import { LiveGameSessionRepository } from '../domain/live-game-session.repository';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { GameplayRuntimeRepository } from '../domain/gameplay-runtime.repository';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { CreateLiveGameSession } from './create-live-game-session.use-case';
import { CreateGameplayRuntime } from './gameplay-runtime.queries';
import { GameplayRuntimeExecutor } from './gameplay-runtime.executor';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { LiveSessionClock } from './live-session-clock';
import { LiveSessionCommandExecutor } from './live-session-command.base';
import {
  MarkSessionReady,
  StartLiveGameSession,
} from './live-session-lifecycle.use-cases';

/**
 * Bug 1, end to end at the use-case level: a session plays challenge A, A
 * finishes, the players go back to the board and pick challenge B.
 *
 * `GAMEPLAY_RUNTIME_EXISTS` is doing its job here and must keep doing it — the
 * bug was never the guard, it was that a finished challenge never reached a
 * terminal status for the guard to see.
 */

class MemorySessionRepository implements LiveGameSessionRepository {
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

/** Keeps every runtime, newest first, the way the Mongo repository does. */
class MemoryRuntimeRepository implements GameplayRuntimeRepository {
  async findStateById(runtimeId: string) {
    const runtime = await this.findById(runtimeId);
    return runtime ? runtime.serialize() : null;
  }

  readonly all: GameplayRuntime[] = [];
  async create(runtime: GameplayRuntime) {
    this.all.unshift(runtime);
  }
  async findBySessionId(sessionId: string) {
    return this.all.find((runtime) => runtime.sessionId === sessionId) ?? null;
  }
  async findById(id: string) {
    return this.all.find((runtime) => runtime.id === id) ?? null;
  }
  async save(runtime: GameplayRuntime, expectedRevision: number) {
    void runtime;
    void expectedRevision;
  }
  async findSessionIdsWithLiveRuntimes() {
    return this.all
      .filter((runtime) => !runtime.isTerminal)
      .map((runtime) => runtime.sessionId);
  }
}

describe('a live session plays challenges in sequence', () => {
  const now = new Date('2026-08-14T00:00:00.000Z');
  const clock: LiveSessionClock = { now: () => now };
  const actor = { id: 'host', fullName: 'Host' } as never;
  const controller = { kind: 'user' as const, actorId: 'host' };

  let sessions: MemorySessionRepository;
  let runtimes: MemoryRuntimeRepository;
  let createRuntime: CreateGameplayRuntime;
  let sessionId: string;

  const finishActiveRuntime = () => {
    const runtime = runtimes.all[0];
    runtime.start('start-runtime', 'host', now);
    const round = runtime.createRound(
      { commandId: 'round', actorId: 'host', activeTeamId: 'team-1' },
      now,
    );
    runtime.startRound(round.id, 'start-round', 'host', now);
    runtime.completeRound({
      roundId: round.id,
      commandId: 'complete-round',
      actorId: 'host',
      reason: 'items_completed',
      now,
    });
    runtime.complete('complete-runtime', 'host', now);
    return runtime;
  };

  beforeEach(async () => {
    sessions = new MemorySessionRepository();
    runtimes = new MemoryRuntimeRepository();
    const snapshots = new LiveGameSessionSnapshotMapper();
    const publisher = { publish: jest.fn(), publishEvent: jest.fn() };
    const parentGames = {
      assertAccessible: jest.fn(),
      gameplaySetup: jest.fn().mockResolvedValue({
        sessionModeKey: 'core-timed-turns',
        sessionModeVersion: 1,
        runtimeModeKey: 'core-round-runtime',
        runtimeModeVersion: 1,
      }),
      markQuestionStarted: jest.fn(),
      finalizeBombQuestion: jest.fn(),
    };

    const created = await new CreateLiveGameSession(
      sessions,
      clock,
      new LiveGameModeRegistry(),
      snapshots,
      parentGames,
    ).execute({
      actor,
      modeKey: CORE_TIMED_TURNS_MODE.key,
      modeVersion: CORE_TIMED_TURNS_MODE.version,
      teamNames: ['One', 'Two'],
    });
    sessionId = created.snapshot.sessionId;

    const commands = new LiveSessionCommandExecutor(
      sessions,
      clock,
      snapshots,
      publisher as never,
      { synchronize: jest.fn().mockResolvedValue(undefined) },
    );
    const ready = await new MarkSessionReady(commands).execute({
      sessionId,
      actorId: 'host',
      commandId: '00000000-0000-4000-8000-0000000000a1',
      expectedRevision: sessions.session!.revision,
    });
    await new StartLiveGameSession(commands, parentGames).execute({
      sessionId,
      actorId: 'host',
      commandId: '00000000-0000-4000-8000-0000000000a2',
      expectedRevision: ready.revision,
    });

    createRuntime = new CreateGameplayRuntime(
      runtimes,
      sessions,
      new GameplayModeRegistry(),
      clock,
      new GameplayRuntimeExecutor(
        runtimes,
        sessions,
        clock,
        snapshots,
        { toSnapshot: () => ({}) as never } as never,
        publisher as never,
        {
          enrichSnapshot: (s: unknown) => s,
          notifyRuntimeMutated: jest.fn(),
        } as never,
      ),
      publisher as never,
      { ...parentGames, gameplaySetup: jest.fn().mockResolvedValue(undefined) },
    );
  });

  const startChallenge = (commandId: string) =>
    createRuntime.execute({
      sessionId,
      actor: controller,
      commandId,
      expectedSessionRevision: sessions.session!.revision,
    });

  it('refuses a second challenge while the first is still running', async () => {
    await startChallenge('challenge-a');

    await expect(startChallenge('challenge-b')).rejects.toMatchObject({
      code: 'GAMEPLAY_RUNTIME_EXISTS',
    });
    expect(runtimes.all).toHaveLength(1);
  });

  it('starts the next challenge once the first is terminal', async () => {
    await startChallenge('challenge-a');
    const first = finishActiveRuntime();

    expect(first.isTerminal).toBe(true);

    await expect(startChallenge('challenge-b')).resolves.toBeDefined();

    // A new runtime, not a reused one, and the finished challenge is still on
    // record — the guard is satisfied by terminality, not by deletion.
    expect(runtimes.all).toHaveLength(2);
    expect(runtimes.all[0].id).not.toBe(first.id);
    expect(runtimes.all[0].isTerminal).toBe(false);
    expect(runtimes.all.filter((runtime) => runtime.isTerminal)).toHaveLength(
      1,
    );
  });

  it('treats an explicitly cancelled runtime as terminal and non-blocking', async () => {
    await startChallenge('challenge-a');
    const first = runtimes.all[0];
    first.cancel('abort-a', 'host', now);

    await expect(startChallenge('challenge-b')).resolves.toBeDefined();
    expect(runtimes.all).toHaveLength(2);
    expect(first.status).toBe('cancelled');
    expect(first.isTerminal).toBe(true);
  });

  it('leaves no active runtime for the session after a challenge finishes', async () => {
    await startChallenge('challenge-a');
    finishActiveRuntime();

    const current = await runtimes.findBySessionId(sessionId);
    expect(current?.isTerminal).toBe(true);
  });

  it('plays three challenges back to back', async () => {
    for (const commandId of ['a', 'b', 'c']) {
      await startChallenge(`challenge-${commandId}`);
      finishActiveRuntime();
    }
    expect(runtimes.all).toHaveLength(3);
    expect(runtimes.all.every((runtime) => runtime.isTerminal)).toBe(true);
  });

  it('replays a duplicate start command instead of creating a twin runtime', async () => {
    await startChallenge('challenge-a');
    await expect(startChallenge('challenge-a')).resolves.toBeDefined();
    expect(runtimes.all).toHaveLength(1);
  });
});
