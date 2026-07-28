import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import {
  MarkSessionReady,
  StartLiveGameSession,
} from './live-session-lifecycle.use-cases';
import { EndActiveTurn, StartTeamTurn } from './live-session-turn.use-cases';
import { BombExpirationScheduler } from './bomb-expiration.scheduler';

@Injectable()
export class StartBombGameplay {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly markReady: MarkSessionReady,
    private readonly startSession: StartLiveGameSession,
    private readonly endTurn: EndActiveTurn,
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly startTurn: StartTeamTurn,
    private readonly getRuntime: GetGameplayRuntime,
    private readonly expiration: BombExpirationScheduler,
  ) {}

  async startAfterCountdown(sessionId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session) return;
    const state = session.serialize();
    const representativesReady = state.teams
      .filter((team) => team.active)
      .every((team) =>
        state.participants.some(
          (participant) =>
            participant.role === 'team-player' &&
            participant.teamId === team.id &&
            participant.ready &&
            participant.connected &&
            !participant.removedAt,
        ),
      );
    if (
      state.status !== 'ready' ||
      !state.countdownEndsAt ||
      state.countdownEndsAt.getTime() > Date.now() ||
      !representativesReady
    )
      return;
    return this.execute(sessionId, session.controllerActorId);
  }

  async execute(sessionId: string, actorId: string) {
    let session = await this.requiredSession(sessionId, actorId);
    let sessionState = session.serialize();
    if (sessionState.modeKey !== 'bomb' || !sessionState.parentGameQuestionId) {
      throw new LiveSessionDomainError(
        'SESSION_NOT_BOMB',
        'Only a board-linked Bomb session can use this launch flow',
      );
    }

    if (sessionState.status === 'waiting') {
      await this.markReady.execute({
        sessionId,
        actorId,
        expectedRevision: session.revision,
        commandId: randomUUID(),
      });
      session = await this.requiredSession(sessionId, actorId);
      sessionState = session.serialize();
    }
    if (sessionState.status === 'ready') {
      await this.startSession.execute({
        sessionId,
        actorId,
        expectedRevision: session.revision,
        commandId: randomUUID(),
      });
      session = await this.requiredSession(sessionId, actorId);
      sessionState = session.serialize();
    }
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Bomb session must be active to launch gameplay',
      );
    }

    let runtime = await this.runtimes.findBySessionId(sessionId);
    if (
      sessionState.activeTeamId &&
      runtime?.serialize().status !== 'round-active'
    ) {
      await this.endTurn.execute({
        sessionId,
        actorId,
        expectedRevision: session.revision,
        commandId: randomUUID(),
        reason: 'bomb-launch-recovery',
      });
      session = await this.requiredSession(sessionId, actorId);
      sessionState = session.serialize();
    }

    const actor = { kind: 'user' as const, actorId };
    if (!runtime) {
      await this.createRuntime.execute({
        sessionId,
        actor,
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        modeKey: 'bomb',
        modeVersion: 1,
      });
      runtime = await this.requiredRuntime(sessionId);
    }

    let runtimeState = runtime.serialize();
    if (runtimeState.status === 'initialized') {
      await this.startRuntime.execute({
        sessionId,
        actor,
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        expectedRuntimeRevision: runtime.revision,
      });
      runtime = await this.requiredRuntime(sessionId);
      runtimeState = runtime.serialize();
    }

    if (
      (runtimeState.status === 'awaiting-round' ||
        runtimeState.status === 'between-rounds') &&
      !runtimeState.activeRound
    ) {
      const initialTeam = sessionState.teams.find((team) => team.active);
      if (!initialTeam) {
        throw new LiveSessionDomainError(
          'BOMB_ACTIVE_TEAM_REQUIRED',
          'Bomb requires an active initial team',
        );
      }
      const representative = sessionState.participants.find(
        (participant) =>
          participant.role === 'team-player' &&
          participant.teamId === initialTeam.id &&
          participant.ready &&
          participant.connected &&
          !participant.removedAt,
      );
      if (!representative) {
        throw new LiveSessionDomainError(
          'BOMB_REPRESENTATIVE_REQUIRED',
          'The initial Bomb team requires a connected ready representative',
        );
      }
      await this.createRound.execute({
        sessionId,
        actor,
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        expectedRuntimeRevision: runtime.revision,
        activeTeamId: initialTeam.id,
        activeParticipantId: representative.id,
      });
      runtime = await this.requiredRuntime(sessionId);
      runtimeState = runtime.serialize();
    }

    if (runtimeState.activeRound?.status === 'pending') {
      await this.startRound.execute({
        sessionId,
        actor,
        roundId: runtimeState.activeRound.id,
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        expectedRuntimeRevision: runtime.revision,
      });
      runtime = await this.requiredRuntime(sessionId);
      runtimeState = runtime.serialize();
    }

    if (
      runtimeState.status === 'round-active' &&
      runtimeState.activeRound?.activeTeamId &&
      !sessionState.activeTeamId
    ) {
      await this.startTurn.execute({
        sessionId,
        actorId,
        teamId: runtimeState.activeRound.activeTeamId,
        expectedRevision: session.revision,
        commandId: randomUUID(),
        reason: 'bomb-round-start',
      });
    }

    await this.expiration.schedule(sessionId);
    return this.getRuntime.execute(sessionId, actor);
  }

  private async requiredSession(sessionId: string, actorId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new LiveSessionNotFoundError(sessionId);
    if (session.controllerActorId !== actorId) {
      throw new LiveSessionForbiddenError();
    }
    return session;
  }

  private async requiredRuntime(sessionId: string) {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!runtime) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_RUNTIME_NOT_FOUND',
        'Bomb runtime was not created',
      );
    }
    return runtime;
  }
}
