import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { LiveGameSessionSnapshot } from './live-game-session.snapshot';
import { LiveSessionActor } from './live-session-actor';
import { LiveSessionSnapshotComposer } from './live-session-snapshot.composer';

@Injectable()
export class GetLiveGameSession {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly repository: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly composer: LiveSessionSnapshotComposer,
  ) {}

  async execute(
    sessionId: string,
    identity: string | LiveSessionActor,
  ): Promise<LiveGameSessionSnapshot> {
    const actor: LiveSessionActor =
      typeof identity === 'string'
        ? { kind: 'user', actorId: identity }
        : identity;
    const session = await this.repository.findById(sessionId);
    if (!session) throw new LiveSessionNotFoundError(sessionId);
    const state = session.serialize();
    const authorized =
      actor.kind === 'user'
        ? session.controllerActorId === actor.actorId ||
          state.participants.some(
            (participant) => participant.actorId === actor.actorId,
          )
        : actor.sessionId === sessionId &&
          state.participants.some(
            (participant) =>
              participant.id === actor.participantId &&
              !participant.removedAt &&
              participant.credentialVersion === actor.credentialVersion,
          );
    if (!authorized) {
      throw new LiveSessionForbiddenError();
    }
    return this.composer.compose(session, actor, this.clock.now());
  }
}
