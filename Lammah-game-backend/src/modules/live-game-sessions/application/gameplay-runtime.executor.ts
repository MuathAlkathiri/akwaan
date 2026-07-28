import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  GameplayRuntimeNotFoundError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { LiveGameSession } from '../domain/live-game-session';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { GameplayRuntimeSnapshotMapper } from './gameplay-runtime.snapshot';
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';
import { LiveSessionActor, actorSnapshotId } from './live-session-actor';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';

export interface GameplayRuntimeCommand {
  sessionId: string;
  actor: LiveSessionActor;
  commandId: string;
  expectedRuntimeRevision: number;
  expectedSessionRevision: number;
  clientTimestamp?: string;
}

@Injectable()
export class GameplayRuntimeExecutor {
  private readonly logger = new Logger(GameplayRuntimeExecutor.name);

  constructor(
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly sessionSnapshots: LiveGameSessionSnapshotMapper,
    private readonly gameplaySnapshots: GameplayRuntimeSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  async execute(
    event: string,
    command: GameplayRuntimeCommand,
    authorize: (session: LiveGameSession, runtime: GameplayRuntime) => void,
    mutate: (
      session: LiveGameSession,
      runtime: GameplayRuntime,
      now: Date,
    ) => void,
  ): Promise<LiveGameSessionSnapshot> {
    const session = await this.sessions.findById(command.sessionId);
    if (!session) throw new LiveSessionNotFoundError(command.sessionId);
    const runtime = await this.runtimes.findBySessionId(command.sessionId);
    if (!runtime) throw new GameplayRuntimeNotFoundError(command.sessionId);
    this.assertActorSession(command.actor, command.sessionId);
    authorize(session, runtime);
    const now = this.clock.now();
    if (runtime.isDuplicate(command.commandId)) {
      this.logger.log({
        event: 'duplicate_gameplay_command_ignored',
        sessionId: command.sessionId,
        runtimeId: runtime.id,
        commandId: command.commandId,
        actorId: command.actor.actorId,
        revision: runtime.revision,
      });
      return this.snapshot(session, runtime, command.actor, now);
    }
    session.assertRevision(command.expectedSessionRevision);
    runtime.assertRevision(command.expectedRuntimeRevision);
    const previousRevision = runtime.revision;
    mutate(session, runtime, now);
    await this.runtimes.save(runtime, previousRevision);
    const snapshot = this.snapshot(session, runtime, command.actor, now);
    this.publisher.publishEvent(command.sessionId, event, {
      runtimeId: runtime.id,
      runtimeRevision: runtime.revision,
      sessionRevision: session.revision,
    });
    this.logger.log({
      event,
      sessionId: command.sessionId,
      runtimeId: runtime.id,
      modeKey: runtime.modeKey,
      modeVersion: runtime.modeVersion,
      commandId: command.commandId,
      actorId: command.actor.actorId,
      previousRevision,
      revision: runtime.revision,
      sessionRevision: session.revision,
      clientTimestamp: command.clientTimestamp,
    });
    return snapshot;
  }

  snapshot(
    session: LiveGameSession,
    runtime: GameplayRuntime,
    actor: LiveSessionActor,
    now = this.clock.now(),
  ): LiveGameSessionSnapshot {
    const snapshot = this.sessionSnapshots.toSnapshot(
      session,
      actorSnapshotId(actor),
      now,
    );
    snapshot.availableActions = snapshot.availableActions.filter(
      (action) => action !== 'runtime:create',
    );
    snapshot.gameplay = this.gameplaySnapshots.toSnapshot(
      runtime,
      session,
      actor,
      now,
    );
    return snapshot;
  }

  assertController(session: LiveGameSession, actor: LiveSessionActor): void {
    if (actor.kind !== 'user' || session.controllerActorId !== actor.actorId) {
      throw new LiveSessionForbiddenError();
    }
  }

  private assertActorSession(actor: LiveSessionActor, sessionId: string): void {
    if (actor.kind === 'participant' && actor.sessionId !== sessionId) {
      throw new LiveSessionForbiddenError();
    }
  }
}
