import { Inject, Injectable, Logger } from '@nestjs/common';
import { LiveGameSession } from '../domain/live-game-session';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import {
  GAMEPLAY_DEADLINE_SYNCHRONIZER,
  GameplayDeadlineSynchronizer,
} from './gameplay-deadline.port';

export interface LiveSessionCommand {
  sessionId: string;
  actorId: string;
  expectedRevision: number;
  commandId: string;
  clientTimestamp?: string;
}

@Injectable()
export class LiveSessionCommandExecutor {
  private readonly logger = new Logger(LiveSessionCommandExecutor.name);

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly repository: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    @Inject(GAMEPLAY_DEADLINE_SYNCHRONIZER)
    private readonly deadlines: GameplayDeadlineSynchronizer,
  ) {}

  async execute(
    event: string,
    command: LiveSessionCommand,
    mutate: (session: LiveGameSession, now: Date) => void,
  ): Promise<LiveGameSessionSnapshot> {
    const session = await this.repository.findById(command.sessionId);
    if (!session) throw new LiveSessionNotFoundError(command.sessionId);
    if (session.controllerActorId !== command.actorId) {
      throw new LiveSessionForbiddenError();
    }
    const now = this.clock.now();
    if (session.isDuplicate(command.commandId)) {
      this.logger.log({
        event: 'duplicate_command_ignored',
        sessionId: session.id,
        modeKey: session.modeKey,
        actorId: command.actorId,
        commandId: command.commandId,
        revision: session.revision,
      });
      return this.snapshots.toSnapshot(session, command.actorId, now);
    }
    session.assertRevision(command.expectedRevision);
    const previousRevision = session.revision;
    mutate(session, now);
    session.completeCommand(command.commandId, now);
    await this.repository.save(session, previousRevision);
    const snapshot = this.snapshots.toSnapshot(session, command.actorId, now);
    this.logger.log({
      event,
      sessionId: session.id,
      modeKey: session.modeKey,
      actorId: command.actorId,
      commandId: command.commandId,
      previousRevision,
      revision: session.revision,
      clientTimestamp: command.clientTimestamp,
    });
    this.publisher.publish(event, snapshot, {
      commandId: command.commandId,
      actorId: command.actorId,
    });
    // A session command is the other half of the deadline lifecycle: Bomb's
    // clock is session state, so starting, switching, pausing or ending a turn
    // is a deadline appearing or disappearing. Converging here is what removes
    // the need for a start-of-challenge use case to arm anything itself.
    //
    // After the command is durably committed and announced, and never able to
    // fail it: a timer that could not be armed must not undo a turn that has
    // already happened. The next mutation or a restart converges again.
    await this.synchronizeDeadlines(command.sessionId);
    return snapshot;
  }

  private async synchronizeDeadlines(sessionId: string): Promise<void> {
    try {
      await this.deadlines.synchronize(sessionId);
    } catch (error) {
      this.logger.error({
        event: 'gameplay_deadline_synchronization_failed',
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
