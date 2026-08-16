import { ReassignTeamActions } from './reassign-team-actions.use-case';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import {
  buildTeamRotations,
  createTeamActionAssignmentState,
  assignNextTeamAction,
  serializeTeamActionAssignments,
  parseTeamActionAssignments,
} from '../domain/team-action-assignment';
import type { GameplayRuntimeState } from '../domain/gameplay-runtime';

/**
 * The disconnect-driven runtime mutation, under competition.
 *
 * This is the one place a socket event writes *gameplay* state: when the player
 * holding a team action drops, the action is handed to a teammate. It competes
 * with real gameplay commands for the same runtime document, so the questions
 * that matter are whether it can overwrite one, whether it can be silently lost
 * to one, and whether it can act on a player who is no longer actually gone.
 *
 * The interleavings below are exact rather than timing-dependent: the fake
 * runtime store commits a competing mutation at a chosen point between this use
 * case's read and its write.
 */

const NOW = new Date('2026-08-15T00:00:00.000Z');

function sessionWith(connected: Record<string, boolean>) {
  const session = LiveGameSession.create({
    controllerActorId: 'host',
    controllerDisplayName: 'Host',
    teamNames: ['One', 'Two'],
    reconnectTokenHash: 'hash',
    rules: CORE_TIMED_TURNS_MODE,
    now: NOW,
  });
  const teamId = session.serialize().teams[0].id;
  const ids: Record<string, string> = {};
  for (const name of Object.keys(connected)) {
    const participant = session.enrollParticipant({
      displayName: name,
      teamId,
      role: 'team-player',
      joinRequestId: `join-${name}`,
      now: NOW,
    });
    ids[name] = participant.id;
    session.setParticipantReady(participant.id, true, NOW);
  }
  session.applyPresence(
    new Map(
      Object.entries(connected).map(([name, isConnected]) => [
        ids[name],
        {
          connected: isConnected,
          connectedDeviceCount: isConnected ? 1 : 0,
          lastSeenAt: NOW,
        },
      ]),
    ),
  );
  return { session, ids, teamId };
}

/** A runtime carrying one open team action, held by `holderId`. */
function runtimeState(input: {
  teamId: string;
  holderId: string;
  rotation: string[];
  revision: number;
}): GameplayRuntimeState {
  let assignments = createTeamActionAssignmentState(
    buildTeamRotations({
      teams: [input.teamId],
      participants: input.rotation.map((participantId) => ({
        participantId,
        teamId: input.teamId,
        connected: true,
      })),
      randomIndex: () => input.rotation.indexOf(input.holderId),
    }),
  );
  assignments = assignNextTeamAction(assignments, {
    teamId: input.teamId,
    action: 'closest.answer',
    participants: input.rotation.map((participantId) => ({
      participantId,
      teamId: input.teamId,
      connected: true,
    })),
  }).state;
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    modeKey: 'closest',
    modeVersion: 1,
    stateSchemaVersion: 1,
    status: 'round-active',
    revision: input.revision,
    runtimeState: {
      teamActionJson: serializeTeamActionAssignments(assignments),
    },
    completedRounds: [],
    processedCommandIds: [],
    transitions: [],
    events: [],
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    activeRound: {
      id: 'round-1',
      runtimeId: 'runtime-1',
      sequence: 1,
      status: 'active',
      createdAt: NOW,
      activeTeamId: input.teamId,
      activeParticipantId: input.holderId,
      modeStateSchemaVersion: 1,
      modeState: { activeParticipantId: input.holderId },
      transitionRevision: input.revision,
    },
  } as unknown as GameplayRuntimeState;
}

/**
 * A runtime store that behaves like the real one: writes are guarded on the
 * revision that was read, and a mismatch raises the same concurrency error.
 */
function runtimeStore(initial: GameplayRuntimeState) {
  let stored = initial;
  const saves: GameplayRuntimeState[] = [];
  /** Runs once, just before the next save, to simulate a competing commit. */
  let interpose: (() => void) | undefined;

  const asAggregate = (state: GameplayRuntimeState) => {
    const working: GameplayRuntimeState = JSON.parse(
      JSON.stringify(state),
    ) as GameplayRuntimeState;
    return {
      id: working.id,
      modeKey: working.modeKey,
      get revision() {
        return working.revision;
      },
      serialize: () => working,
      applyModeState: (input: {
        runtimeState: Record<string, unknown>;
        roundState: Record<string, unknown>;
        activeParticipantId?: string;
      }) => {
        working.revision += 1;
        working.runtimeState = input.runtimeState as never;
        working.activeRound!.modeState = input.roundState as never;
        if (input.activeParticipantId) {
          working.activeRound!.activeParticipantId = input.activeParticipantId;
        }
      },
    };
  };

  return {
    repository: {
      findBySessionId: () => Promise.resolve(asAggregate(stored)),
      save: (
        runtime: { serialize: () => GameplayRuntimeState },
        expected: number,
      ) => {
        interpose?.();
        interpose = undefined;
        if (expected !== stored.revision) {
          return Promise.reject(new LiveSessionConcurrencyError());
        }
        stored = runtime.serialize();
        saves.push(stored);
        return Promise.resolve();
      },
    },
    saves,
    current: () => stored,
    /** Commit a competing gameplay mutation right before the next save. */
    competeOnce(mutate: (state: GameplayRuntimeState) => void) {
      interpose = () => {
        const next = JSON.parse(JSON.stringify(stored)) as GameplayRuntimeState;
        next.revision += 1;
        mutate(next);
        stored = next;
      };
    },
  };
}

function useCase(
  session: LiveGameSession,
  runtimes: ReturnType<typeof runtimeStore>['repository'],
) {
  const published: string[] = [];
  const instance = new ReassignTeamActions(
    { findById: () => Promise.resolve(session) } as never,
    runtimes as never,
    { now: () => NOW },
    new LiveGameSessionSnapshotMapper(),
    {
      publish: (event: string) => published.push(event),
      publishEvent: () => undefined,
    } as never,
  );
  return { instance, published };
}

const holderOf = (state: GameplayRuntimeState) =>
  parseTeamActionAssignments(
    state.runtimeState.teamActionJson,
  ).assignments.find((assignment) => assignment.action === 'closest.answer')!
    .participantId;

describe('disconnect-driven team action reassignment', () => {
  it('hands the action on when its holder is gone', () => {
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);

    return instance.forSession('session-1').then((changed) => {
      expect(changed).toHaveLength(1);
      expect(holderOf(store.current())).toBe(ids.bob);
      expect(store.current().activeRound!.activeParticipantId).toBe(ids.bob);
    });
  });

  it('does nothing when a late disconnect arrives for a player who reconnected', async () => {
    // Scenario 4, and the historical "wrong actor" symptom. Socket A dies, the
    // player is already back on socket B, and only then does A's disconnect
    // callback run. Presence still reports them connected — that is the Batch 2
    // guarantee — so the holder is eligible and nothing is handed away.
    const { session, ids, teamId } = sessionWith({ alice: true, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance, published } = useCase(session, store.repository);

    expect(await instance.forSession('session-1')).toEqual([]);
    expect(store.saves).toHaveLength(0);
    expect(holderOf(store.current())).toBe(ids.alice);
    expect(published).toEqual([]);
  });

  it('cannot overwrite a gameplay mutation that landed first', async () => {
    // Scenarios 1, 2, 3 and 5 share one shape: something else commits between
    // this use case's read and its write. The revision guard must refuse that
    // write rather than replacing the newer runtime.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);

    // A player's answer commits first and leaves a marker this must not erase.
    store.competeOnce((state) => {
      state.runtimeState.answeredBy = 'gameplay-command';
    });

    await instance.forSession('session-1');

    expect(store.current().runtimeState.answeredBy).toBe('gameplay-command');
  });

  it('retries against fresh state instead of dropping the handoff', async () => {
    // Losing the race used to mean the action stayed with the player who left
    // and nothing ever moved it — a challenge waiting on an empty chair.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);
    store.competeOnce((state) => {
      state.runtimeState.answeredBy = 'gameplay-command';
    });

    const changed = await instance.forSession('session-1');

    expect(changed).toHaveLength(1);
    // Both survive: the competing write, and the handoff that retried onto it.
    expect(store.current().runtimeState.answeredBy).toBe('gameplay-command');
    expect(holderOf(store.current())).toBe(ids.bob);
  });

  it('writes nothing when the winning mutation already reassigned the action', async () => {
    // Progression to the next item opens its own assignments against current
    // presence. The retry must notice that and stop, not fight it.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);
    store.competeOnce((state) => {
      state.runtimeState = runtimeState({
        teamId,
        holderId: ids.bob,
        rotation: [ids.alice, ids.bob],
        revision: state.revision,
      }).runtimeState;
    });

    expect(await instance.forSession('session-1')).toEqual([]);
    expect(store.saves).toHaveLength(0);
    expect(holderOf(store.current())).toBe(ids.bob);
  });

  it('gives up quietly when every attempt loses, without throwing', async () => {
    // A disconnect owes the rest of its work — the Bomb countdown check — so
    // this may never escape as an exception.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const alwaysLoses = {
      findBySessionId: store.repository.findBySessionId,
      save: () => Promise.reject(new LiveSessionConcurrencyError()),
    };
    const { instance } = useCase(session, alwaysLoses as never);

    await expect(instance.forSession('session-1')).resolves.toEqual([]);
  });

  it('two disconnects produce one handoff, not two', async () => {
    // Both phones of a team drop together. Whichever call runs second sees the
    // first one's result and, if the action already sits with someone eligible,
    // leaves it alone.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: true });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);

    await instance.forSession('session-1');
    await instance.forSession('session-1');

    expect(store.saves).toHaveLength(1);
    expect(holderOf(store.current())).toBe(ids.bob);
  });

  it('leaves the action alone when nobody on the team is available', async () => {
    // Handing an action to nobody would be worse than leaving it: the rotation
    // keeps the departed player's place for when they return.
    const { session, ids, teamId } = sessionWith({ alice: false, bob: false });
    const store = runtimeStore(
      runtimeState({
        teamId,
        holderId: ids.alice,
        rotation: [ids.alice, ids.bob],
        revision: 5,
      }),
    );
    const { instance } = useCase(session, store.repository);

    expect(await instance.forSession('session-1')).toEqual([]);
    expect(store.saves).toHaveLength(0);
  });
});
