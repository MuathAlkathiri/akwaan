import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import {
  hashReconnectToken,
  issueReconnectToken,
} from './create-live-game-session.use-case';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshot } from './live-game-session.snapshot';
import { LiveSessionSnapshotComposer } from './live-session-snapshot.composer';

@Injectable()
export class ReconnectParticipant {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly repository: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly snapshotComposer: LiveSessionSnapshotComposer,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    reconnectToken: string;
    expectedRevision: number;
    commandId: string;
  }): Promise<{
    snapshot: LiveGameSessionSnapshot;
    reconnectToken: string;
  }> {
    const session = await this.repository.findById(input.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.sessionId);
    const participant = session
      .serialize()
      .participants.find((item) => item.actorId === input.actorId);
    if (
      !participant?.reconnectTokenHash ||
      participant.reconnectTokenHash !==
        hashReconnectToken(input.reconnectToken)
    ) {
      throw new LiveSessionForbiddenError();
    }
    if (session.isDuplicate(input.commandId)) {
      return {
        snapshot: await this.snapshotComposer.compose(
          session,
          { kind: 'user', actorId: input.actorId },
          this.clock.now(),
        ),
        reconnectToken: input.reconnectToken,
      };
    }
    session.assertRevision(input.expectedRevision);
    const expectedRevision = session.revision;
    const now = this.clock.now();
    const reconnectToken = issueReconnectToken();
    session.reconnectParticipant(
      input.actorId,
      hashReconnectToken(reconnectToken),
      now,
    );
    session.completeCommand(input.commandId, now);
    await this.repository.save(session, expectedRevision);
    return {
      snapshot: await this.snapshotComposer.compose(
        session,
        { kind: 'user', actorId: input.actorId },
        now,
      ),
      reconnectToken,
    };
  }
}
