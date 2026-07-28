import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  generateJoinCode,
  LiveSessionJoinAccess,
  normalizeJoinCode,
  TeamAssignmentPolicy,
} from '../domain/live-session-join-access';
import {
  LIVE_SESSION_JOIN_ACCESS_REPOSITORY,
  LiveSessionJoinAccessRepository,
} from '../domain/live-session-join-access.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';

export interface JoinAccessView {
  joinCode: string;
  assignmentPolicy: TeamAssignmentPolicy;
  teamScopeId?: string;
  maximumParticipantCount?: number;
  teamCapacity?: number;
  createdAt: string;
  expiresAt: string;
  enabled: boolean;
  revokedAt?: string;
}

function mapAccess(access: LiveSessionJoinAccess): JoinAccessView {
  const state = access.serialize();
  return {
    joinCode: state.publicCode,
    assignmentPolicy: state.assignmentPolicy,
    teamScopeId: state.teamScopeId,
    maximumParticipantCount: state.maximumParticipantCount,
    teamCapacity: state.teamCapacity,
    createdAt: state.createdAt.toISOString(),
    expiresAt: state.expiresAt.toISOString(),
    enabled: state.enabled,
    revokedAt: state.revokedAt?.toISOString(),
  };
}

@Injectable()
export class CreateSessionJoinAccess {
  private readonly logger = new Logger(CreateSessionJoinAccess.name);

  constructor(
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    assignmentPolicy: TeamAssignmentPolicy;
    teamScopeId?: string;
    maximumParticipantCount?: number;
    teamCapacity?: number;
    expiresInMinutes?: number;
  }): Promise<JoinAccessView> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.sessionId);
    if (session.controllerActorId !== input.actorId) {
      throw new LiveSessionForbiddenError();
    }
    const existing = await this.accesses.findCurrentBySessionId(
      input.sessionId,
    );
    const now = this.clock.now();
    if (existing) {
      try {
        existing.assertAvailable(now);
        return mapAccess(existing);
      } catch {
        const revision = existing.revision;
        existing.revoke(input.actorId, now);
        await this.accesses.save(existing, revision);
      }
    }
    const sessionState = session.serialize();
    if (
      !['waiting', 'ready'].includes(sessionState.status) ||
      (sessionState.modeKey === 'bomb' && sessionState.status !== 'waiting')
    ) {
      throw new LiveSessionDomainError(
        'SESSION_NOT_JOINABLE',
        'Session is not accepting participants',
      );
    }
    if (
      input.teamScopeId &&
      !sessionState.teams.some(
        (team) => team.id === input.teamScopeId && team.active,
      )
    ) {
      throw new LiveSessionDomainError(
        'UNKNOWN_TEAM',
        'Join access team does not belong to this session',
      );
    }
    const requestedExpiration = new Date(
      now.getTime() + (input.expiresInMinutes ?? 120) * 60_000,
    );
    const expiresAt =
      requestedExpiration.getTime() < sessionState.expiresAt.getTime()
        ? requestedExpiration
        : sessionState.expiresAt;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const access = LiveSessionJoinAccess.create({
        sessionId: input.sessionId,
        publicCode: generateJoinCode(),
        assignmentPolicy: input.assignmentPolicy,
        teamScopeId: input.teamScopeId,
        maximumParticipantCount: input.maximumParticipantCount,
        teamCapacity: input.teamCapacity,
        createdByActorId: input.actorId,
        now,
        expiresAt,
      });
      try {
        await this.accesses.create(access);
        const view = mapAccess(access);
        this.publisher.publishEvent(
          input.sessionId,
          'live-session:join-access-changed',
          { ...view },
        );
        this.logger.log({
          event: 'join_access_created',
          sessionId: input.sessionId,
          actorId: input.actorId,
          expiresAt,
        });
        return view;
      } catch (error) {
        if (!isDuplicateKey(error) || attempt === 4) throw error;
      }
    }
    throw new LiveSessionDomainError(
      'JOIN_CODE_GENERATION_FAILED',
      'Unable to allocate a unique join code',
    );
  }
}

@Injectable()
export class GetSessionJoinAccess {
  constructor(
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
  ) {}

  async execute(sessionId: string, actorId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new LiveSessionNotFoundError(sessionId);
    if (session.controllerActorId !== actorId) {
      throw new LiveSessionForbiddenError();
    }
    const access = await this.accesses.findCurrentBySessionId(sessionId);
    return access ? mapAccess(access) : null;
  }
}

@Injectable()
export class RevokeSessionJoinAccess {
  constructor(
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  async execute(sessionId: string, actorId: string): Promise<JoinAccessView> {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new LiveSessionNotFoundError(sessionId);
    if (session.controllerActorId !== actorId) {
      throw new LiveSessionForbiddenError();
    }
    const access = await this.accesses.findCurrentBySessionId(sessionId);
    if (!access) {
      throw new LiveSessionDomainError(
        'JOIN_ACCESS_NOT_FOUND',
        'No active join access exists',
      );
    }
    const revision = access.revision;
    access.revoke(actorId, this.clock.now());
    await this.accesses.save(access, revision);
    const view = mapAccess(access);
    this.publisher.publishEvent(sessionId, 'live-session:join-access-changed', {
      ...view,
    });
    return view;
  }
}

@Injectable()
export class RegenerateSessionJoinAccess {
  constructor(
    private readonly revoke: RevokeSessionJoinAccess,
    private readonly create: CreateSessionJoinAccess,
  ) {}

  async execute(input: Parameters<CreateSessionJoinAccess['execute']>[0]) {
    const current = await this.create.execute(input).catch(() => null);
    if (current?.enabled) {
      await this.revoke.execute(input.sessionId, input.actorId);
    }
    return this.create.execute(input);
  }
}

@Injectable()
export class ResolveJoinCode {
  constructor(
    @Inject(LIVE_SESSION_JOIN_ACCESS_REPOSITORY)
    private readonly accesses: LiveSessionJoinAccessRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
  ) {}

  async execute(joinCode: string) {
    const access = await this.accesses.findByCode(normalizeJoinCode(joinCode));
    if (!access) {
      throw new LiveSessionDomainError(
        'JOIN_ACCESS_UNAVAILABLE',
        'Session join access is unavailable',
      );
    }
    access.assertAvailable(this.clock.now());
    const session = await this.sessions.findById(access.sessionId);
    if (!session) throw new LiveSessionNotFoundError(access.sessionId);
    const state = session.serialize();
    if (
      !['waiting', 'ready'].includes(state.status) ||
      (state.modeKey === 'bomb' && state.status !== 'waiting')
    ) {
      throw new LiveSessionDomainError(
        'SESSION_NOT_JOINABLE',
        'Session is not accepting participants',
      );
    }
    const policy = access.serialize();
    return {
      available: true,
      mode: { key: state.modeKey, version: state.modeVersion },
      status: state.status,
      assignmentPolicy: policy.assignmentPolicy,
      teams:
        policy.assignmentPolicy === 'explicit'
          ? state.teams
              .filter(
                (team) =>
                  team.active &&
                  (!policy.teamScopeId || team.id === policy.teamScopeId),
              )
              .map((team) => ({ id: team.id, name: team.name }))
          : [],
      expiresAt: policy.expiresAt.toISOString(),
      displayName: { required: true, maximumLength: 40 },
    };
  }
}

function isDuplicateKey(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
