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
    return snapshot;
  }
}
