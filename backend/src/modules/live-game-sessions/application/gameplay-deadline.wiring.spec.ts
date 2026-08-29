import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  GameplayDeadlineScheduler,
  pendingDeadline,
} from './gameplay-deadline.scheduler';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { LiveSessionCommandExecutor } from './live-session-command.base';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import {
  GameplayModePlugin,
  MODE_COMMAND_TYPES,
} from '../domain/gameplay-mode.plugin';
import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import type { GameplayRuntimeState } from '../domain/gameplay-runtime';

/**
 * The architectural guarantee, not one mechanic's behaviour.
 *
 * The defect these exist for was never "RYO's timer is wrong". It was that
 * authoritative state could contain a deadline while nothing in the running
 * process was watching it, because arming a timer was a step each start-of-
 * challenge use case had to remember. Every mechanic-specific test passed, and
 * the integration test for the mechanic passed too — because it armed the
 * scheduler itself, which is exactly the production step that did not exist.
 *
 * So nothing below calls `schedule()` or `synchronize()`. These tests drive the
 * hooks *production* drives and assert a timer appears, and they iterate the
 * plugin registry so a mechanic added tomorrow is covered the day it is
 * registered rather than the day somebody remembers it.
 */

const NOW = Date.parse('2026-08-14T00:00:00.000Z');
const DEADLINE = new Date(NOW + 30_000).toISOString();

/**
 * How each registered mechanic is expected to express a deadline.
 *
 * - `runtime-state` — keeps its own clock and declares it on the plugin.
 * - `interaction`  — publishes `prompt.deadlineAt`; enforced without declaring.
 * - `session-clock`— burns the session's team clock (Bomb, and only Bomb).
 * - `none`         — deliberately has no deadline.
 *
 * Exhaustive over the registry by assertion: a mechanic with no entry fails the
 * suite. That is the point. Adding a mechanic forces its author to state, once
 * and in public, how it expires — and the tests below then prove the lifecycle
 * actually honours the answer.
 */
const DEADLINE_CONTRACT: Record<
  string,
  { kind: 'runtime-state' | 'interaction' | 'session-clock' | 'none' }
> = {
  'core-round-runtime': { kind: 'interaction' },
  bomb: { kind: 'session-clock' },
  'read-your-opponent': { kind: 'interaction' },
  'top-5': { kind: 'none' },
  rakkibha: { kind: 'runtime-state' },
  closest: { kind: 'runtime-state' },
  'one-clue': { kind: 'runtime-state' },
  combo: { kind: 'runtime-state' },
  marhala: { kind: 'runtime-state' },
};

/** A live runtime carrying whatever the mechanic uses to express a deadline. */
function liveRuntime(
  plugin: GameplayModePlugin,
  kind: string,
): GameplayRuntimeState {
  const declaration = plugin.deadline;
  const runtimeState =
    declaration?.source === 'runtime-state'
      ? { phase: declaration.activePhases[0], deadlineAt: DEADLINE }
      : {};
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    modeKey: plugin.key,
    modeVersion: plugin.version,
    stateSchemaVersion: plugin.stateSchemaVersion,
    status: 'round-active',
    revision: 4,
    runtimeState,
    completedRounds: [],
    processedCommandIds: [],
    transitions: [],
    events: [],
    createdAt: new Date(NOW),
    expiresAt: new Date(NOW + 3_600_000),
    activeRound: {
      id: 'round-1',
      runtimeId: 'runtime-1',
      sequence: 1,
      status: 'active',
      createdAt: new Date(NOW),
      modeStateSchemaVersion: plugin.stateSchemaVersion,
      modeState: {},
      transitionRevision: 4,
      interaction:
        kind === 'interaction'
          ? ({
              id: 'interaction-1',
              status: 'open',
              revision: 2,
              submissions: [],
              processedRequestIds: [],
              prompt: { id: 'prompt-1', deadlineAt: new Date(DEADLINE) },
            } as never)
          : undefined,
    },
  } as GameplayRuntimeState;
}

/** A session whose active team clock is running, for the Bomb contract. */
const runningClockSession = {
  controllerActorId: 'host-1',
  revision: 3,
  serialize: () => ({
    status: 'active',
    activeTeamId: 'team-1',
    teams: [
      {
        id: 'team-1',
        clock: {
          running: true,
          startedAt: new Date(NOW),
          allocatedMs: 30_000,
          consumedMs: 0,
        },
      },
    ],
  }),
};

function schedulerFor(state: GameplayRuntimeState | undefined) {
  const submit = jest.fn().mockResolvedValue(undefined);
  const resolve = jest.fn().mockResolvedValue(undefined);
  const observers = new GameplayObserverRegistry();
  const scheduler = new GameplayDeadlineScheduler(
    { findById: jest.fn().mockResolvedValue(runningClockSession) } as never,
    {
      findBySessionId: jest
        .fn()
        .mockResolvedValue(
          state ? { revision: state.revision, serialize: () => state } : null,
        ),
      findSessionIdsWithLiveRuntimes: jest.fn().mockResolvedValue([]),
    } as never,
    new GameplayModeRegistry(),
    observers,
    {
      get: (token: { name?: string }) =>
        token?.name === 'GameplayInteractionUseCases'
          ? { close: resolve, resolve }
          : { execute: submit },
    } as never,
  );
  return { scheduler, observers, submit, resolve };
}

describe('every registered mechanic declares how it expires', () => {
  const modes = new GameplayModeRegistry();

  it('has a stated deadline contract for every plugin in the registry', () => {
    const unclassified = modes
      .all()
      .map((plugin) => plugin.key)
      .filter((key) => !DEADLINE_CONTRACT[key]);
    // A new mechanic lands here first. Say how it expires in DEADLINE_CONTRACT
    // above; the tests below then hold the lifecycle to that answer.
    expect(unclassified).toEqual([]);
  });

  it.each(modes.all().map((plugin) => [plugin.key, plugin] as const))(
    '%s expresses its deadline the way it declares',
    (key, plugin) => {
      const contract = DEADLINE_CONTRACT[key];
      if (contract.kind === 'runtime-state') {
        expect(plugin.deadline?.source).toBe('runtime-state');
      } else if (contract.kind === 'session-clock') {
        expect(plugin.deadline?.source).toBe('session-clock');
      } else {
        // An interaction deadline is enforced without being declared, and a
        // mechanic with no clock declares nothing. Either way a declaration
        // here would mean the plugin and its contract disagree.
        expect(plugin.deadline).toBeUndefined();
      }
    },
  );

  it.each(
    modes
      .all()
      .filter((plugin) => plugin.deadline)
      .map((plugin) => [plugin.key, plugin] as const),
  )('%s can actually answer the command it says expires it', (_key, plugin) => {
    const commandType = plugin.deadline!.commandType;
    // A declared expiry command that the plugin cannot handle, or that clients
    // are never told about, is a deadline that fires into nothing.
    expect(plugin.command(commandType)).toBeDefined();
    expect(MODE_COMMAND_TYPES).toContain(commandType);
  });

  it.each(modes.all().map((plugin) => [plugin.key, plugin] as const))(
    'the deadline reducer sees %s the way its contract says',
    (key, plugin) => {
      const contract = DEADLINE_CONTRACT[key];
      const pending = pendingDeadline(
        liveRuntime(plugin, contract.kind),
        plugin.deadline,
        runningClockSession,
      );
      if (contract.kind === 'none') {
        expect(pending).toBeUndefined();
        return;
      }
      // The regression that started all this: state declares a deadline and the
      // reducer cannot see it, so nothing is ever armed for it.
      expect(pending).toBeDefined();
      expect(pending!.kind).toBe(
        contract.kind === 'interaction' ? 'interaction' : 'mode-command',
      );
    },
  );

  it('no mechanic writes a deadline while claiming to have none', () => {
    // Closes the one gap an allowlist leaves: an author adds a mechanic that
    // writes `deadlineAt`, is forced to classify it, and classifies it `none`
    // to make the suite green. Source-level, because whether a reducer ever
    // writes the field cannot be observed without running every branch of it.
    const domain = join(__dirname, '..', 'domain');
    const liars = readdirSync(domain)
      .filter((file) => file.endsWith('.plugin.ts'))
      .filter((file) =>
        /deadlineAt/.test(readFileSync(join(domain, file), 'utf8')),
      )
      .flatMap((file) =>
        modes
          .all()
          .filter(
            (plugin) =>
              file.includes(plugin.key.replace(/-/g, '')) ||
              readFileSync(join(domain, file), 'utf8').includes(
                `= '${plugin.key}'`,
              ),
          )
          .filter((plugin) => DEADLINE_CONTRACT[plugin.key]?.kind === 'none')
          .map((plugin) => `${plugin.key} (${file})`),
      );
    expect(liars).toEqual([]);
  });

  it('enforces interaction deadlines without the mechanic declaring anything', () => {
    // Deliberately a mode key no plugin uses and no declaration at all. The
    // interaction branch must be mode-independent, or a future mechanic that
    // publishes `prompt.deadlineAt` inherits exactly the RYO freeze.
    const anonymous = liveRuntime(
      { ...CORE_TIMED_TURNS_MODE, key: 'not-a-registered-mode' } as never,
      'interaction',
    );
    expect(pendingDeadline(anonymous, undefined)?.kind).toBe('interaction');
  });
});

describe('production lifecycle hooks arm deadlines without being asked to', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('subscribes itself to committed runtime mutations', () => {
    const { scheduler, observers } = schedulerFor(undefined);
    const register = jest.spyOn(observers, 'registerTerminalObserver');
    // Exactly what Nest calls. If this registration is ever dropped, every
    // interaction deadline silently stops being armed by gameplay progression.
    scheduler.onModuleInit();
    expect(register).toHaveBeenCalledWith(scheduler);
  });

  it.each(
    new GameplayModeRegistry()
      .all()
      .filter((plugin) => DEADLINE_CONTRACT[plugin.key]?.kind !== 'none')
      .map((plugin) => [plugin.key, plugin] as const),
  )('arms %s from a committed runtime mutation alone', async (key, plugin) => {
    const contract = DEADLINE_CONTRACT[key];
    const { scheduler, observers, submit, resolve } = schedulerFor(
      liveRuntime(plugin, contract.kind),
    );
    scheduler.onModuleInit();

    // The one call production makes after a committed runtime write. No
    // scheduler method is touched by this test.
    await observers.notifyRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: liveRuntime(plugin, contract.kind),
    });

    expect(jest.getTimerCount()).toBeGreaterThan(0);
    await jest.advanceTimersByTimeAsync(30_100);
    const fired =
      contract.kind === 'interaction'
        ? resolve.mock.calls.length
        : submit.mock.calls.length;
    expect(fired).toBeGreaterThan(0);
    scheduler.onModuleDestroy();
  });

  it('converges deadlines from a committed session command', async () => {
    // Bomb's clock is session state, so a turn starting is a deadline
    // appearing. Nothing on the runtime changes, so the runtime-mutation hook
    // never fires — this boundary is the only thing that can arm it.
    const synchronize = jest.fn().mockResolvedValue(undefined);
    const session = LiveGameSession.create({
      controllerActorId: 'host',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now: new Date(NOW),
    });
    session.markReady(new Date(NOW));
    session.start(new Date(NOW));
    let persisted = session.revision;
    const executor = new LiveSessionCommandExecutor(
      {
        findById: async () => session,
        save: async (_s: LiveGameSession, expected: number) => {
          expect(expected).toBe(persisted);
          persisted = session.revision;
        },
      } as never,
      { now: () => new Date(NOW) },
      new LiveGameSessionSnapshotMapper(),
      { publish: () => undefined, publishEvent: () => undefined },
      { synchronize },
    );

    await executor.execute(
      'live-session:turn-changed',
      {
        sessionId: session.id,
        actorId: 'host',
        commandId: '00000000-0000-4000-8000-00000000d001',
        expectedRevision: session.revision,
      },
      (state, at) => state.startTurn(state.serialize().teams[0].id, 'test', at),
    );

    expect(synchronize).toHaveBeenCalledWith(session.id);
  });

  it('never fails a committed session command because a timer could not be armed', async () => {
    // A turn that already happened must not be undone by a scheduling problem.
    const session = LiveGameSession.create({
      controllerActorId: 'host',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now: new Date(NOW),
    });
    session.markReady(new Date(NOW));
    session.start(new Date(NOW));
    const executor = new LiveSessionCommandExecutor(
      { findById: async () => session, save: async () => undefined } as never,
      { now: () => new Date(NOW) },
      new LiveGameSessionSnapshotMapper(),
      { publish: () => undefined, publishEvent: () => undefined },
      { synchronize: jest.fn().mockRejectedValue(new Error('mongo down')) },
    );

    await expect(
      executor.execute(
        'live-session:turn-changed',
        {
          sessionId: session.id,
          actorId: 'host',
          commandId: '00000000-0000-4000-8000-00000000d002',
          expectedRevision: session.revision,
        },
        (state, at) =>
          state.startTurn(state.serialize().teams[0].id, 'test', at),
      ),
    ).resolves.toBeDefined();
  });

  it('no mechanic start path wires a timer of its own', () => {
    // The structural half of the guarantee. Timer wiring living in a start-of-
    // challenge use case is how one mechanic ends up covered and the next one
    // does not; the reconciler is the only thing allowed to know about timers.
    const offenders = readdirSync(__dirname)
      .filter((file) => file.startsWith('start-') && file.endsWith('.ts'))
      .filter((file) =>
        /GameplayDeadlineScheduler|deadlines?\.(schedule|synchronize)\(/.test(
          readFileSync(join(__dirname, file), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
