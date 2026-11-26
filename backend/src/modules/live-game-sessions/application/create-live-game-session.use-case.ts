import { createHash, randomBytes, randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { LiveGameModeRegistry } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { TEAM_NAMES } from '../domain/team-names';
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';

export interface CreateLiveGameSessionInput {
  modeKey: string;
  modeVersion: number;
  teamColorIds?: string[];
  actor: AuthenticatedUser;
}

export interface CreatedLiveGameSession {
  snapshot: LiveGameSessionSnapshot;
  reconnectToken: string;
}

export function hashReconnectToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueReconnectToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class CreateLiveGameSession {
  private readonly logger = new Logger(CreateLiveGameSession.name);

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly repository: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly modes: LiveGameModeRegistry,
    private readonly snapshots: LiveGameSessionSnapshotMapper,
  ) {}

  async execute(
    input: CreateLiveGameSessionInput,
  ): Promise<CreatedLiveGameSession> {
    const now = this.clock.now();
    const reconnectToken = issueReconnectToken();
    const rules = this.modes.resolve(input.modeKey, input.modeVersion);
    const session = LiveGameSession.create({
      id: randomUUID(),
      controllerActorId: input.actor.id,
      controllerDisplayName: input.actor.fullName,
      teamNames: [...TEAM_NAMES],
      teamColorIds: input.teamColorIds,
      reconnectTokenHash: hashReconnectToken(reconnectToken),
      rules,
      now,
    });
    await this.repository.create(session);
    this.logger.log({
      event: 'live_session_created',
      sessionId: session.id,
      modeKey: session.modeKey,
      actorId: input.actor.id,
      revision: session.revision,
    });
    return {
      snapshot: this.snapshots.toSnapshot(session, input.actor.id, now),
      reconnectToken,
    };
  }
}
