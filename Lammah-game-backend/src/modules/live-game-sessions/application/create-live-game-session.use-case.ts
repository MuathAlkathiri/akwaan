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
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';
import {
  PARENT_GAME_ACCESS,
  ParentGameAccess,
} from './parent-game-access.port';

export interface CreateLiveGameSessionInput {
  parentGameId?: string;
  parentGameQuestionId?: string;
  modeKey: string;
  modeVersion: number;
  teamNames: string[];
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
    @Inject(PARENT_GAME_ACCESS)
    private readonly parentGames: ParentGameAccess,
  ) {}

  async execute(
    input: CreateLiveGameSessionInput,
  ): Promise<CreatedLiveGameSession> {
    const now = this.clock.now();
    if (input.parentGameId) {
      await this.parentGames.assertAccessible(input.parentGameId, input.actor);
    }
    if (input.parentGameId && input.parentGameQuestionId) {
      const existing = await this.repository.findByParentQuestion(
        input.parentGameId,
        input.parentGameQuestionId,
      );
      if (existing) {
        if (existing.controllerActorId !== input.actor.id) {
          throw new Error('Bomb session belongs to another controller');
        }
        return {
          snapshot: this.snapshots.toSnapshot(existing, input.actor.id, now),
          reconnectToken: '',
        };
      }
    }
    const gameplay = input.parentGameId
      ? await this.parentGames.gameplaySetup(
          input.parentGameId,
          input.parentGameQuestionId,
        )
      : undefined;
    const reconnectToken = issueReconnectToken();
    const rules = this.modes.resolve(
      gameplay?.sessionModeKey ?? input.modeKey,
      gameplay?.sessionModeVersion ?? input.modeVersion,
    );
    const session = LiveGameSession.create({
      id: randomUUID(),
      parentGameId: input.parentGameId,
      parentGameQuestionId: input.parentGameQuestionId,
      controllerActorId: input.actor.id,
      controllerDisplayName: input.actor.fullName,
      teamNames: gameplay?.teamNames ?? input.teamNames,
      // A session derived from a parent game brings its own team names, and the
      // colours belong with the names they were chosen alongside.
      ...(gameplay?.teamNames ? {} : { teamColorIds: input.teamColorIds }),
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
