import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { GameplayRuntime } from '../domain/gameplay-runtime';
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
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import { GameplayRuntimeExecutor } from './gameplay-runtime.executor';
import { LiveSessionActor } from './live-session-actor';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import {
  PARENT_GAME_ACCESS,
  ParentGameAccess,
} from './parent-game-access.port';

@Injectable()
export class CreateGameplayRuntime {
  private readonly logger = new Logger(CreateGameplayRuntime.name);

  constructor(
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    private readonly modes: GameplayModeRegistry,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly executor: GameplayRuntimeExecutor,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    @Inject(PARENT_GAME_ACCESS)
    private readonly parentGames: ParentGameAccess,
  ) {}

  async execute(input: {
    sessionId: string;
    actor: LiveSessionActor;
    commandId: string;
    expectedSessionRevision: number;
    modeKey?: string;
    modeVersion?: number;
  }) {
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new LiveSessionNotFoundError(input.sessionId);
    if (
      input.actor.kind !== 'user' ||
      session.controllerActorId !== input.actor.actorId
    ) {
      throw new LiveSessionForbiddenError();
    }
    const existing = await this.runtimes.findBySessionId(input.sessionId);
    if (existing) {
      if (!existing.isDuplicate(input.commandId)) {
        throw new LiveSessionDomainError(
          'GAMEPLAY_RUNTIME_EXISTS',
          'This live session already has a gameplay runtime',
        );
      }
      return this.executor.snapshot(session, existing, input.actor);
    }
    session.assertRevision(input.expectedSessionRevision);
    const state = session.serialize();
    if (state.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before creating gameplay runtime',
      );
    }
    const now = this.clock.now();
    const setup = state.parentGameId
      ? await this.parentGames.gameplaySetup(
          state.parentGameId,
          state.parentGameQuestionId,
        )
      : undefined;
    const runtime = GameplayRuntime.create({
      id: randomUUID(),
      sessionId: input.sessionId,
      plugin: this.modes.resolve(
        setup?.runtimeModeKey ?? input.modeKey ?? 'core-round-runtime',
        setup?.runtimeModeVersion ?? input.modeVersion ?? 1,
      ),
      initialState: setup?.initialRuntimeState,
      commandId: input.commandId,
      actorId: input.actor.actorId,
      now,
      expiresAt: state.expiresAt,
    });
    await this.runtimes.create(runtime);
    const snapshot = this.executor.snapshot(session, runtime, input.actor, now);
    this.publisher.publishEvent(
      input.sessionId,
      'live-session:runtime-changed',
      {
        runtimeId: runtime.id,
        runtimeRevision: runtime.revision,
        sessionRevision: session.revision,
      },
    );
    this.logger.log({
      event: 'gameplay_runtime_created',
      sessionId: input.sessionId,
      runtimeId: runtime.id,
      modeKey: runtime.modeKey,
      modeVersion: runtime.modeVersion,
      actorId: input.actor.actorId,
      revision: runtime.revision,
    });
    return snapshot;
  }
}

@Injectable()
export class GetGameplayRuntime {
  constructor(
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    private readonly executor: GameplayRuntimeExecutor,
  ) {}

  async execute(sessionId: string, actor: LiveSessionActor) {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new LiveSessionNotFoundError(sessionId);
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!runtime) throw new GameplayRuntimeNotFoundError(sessionId);
    const state = session.serialize();
    const allowed =
      (actor.kind === 'user' && session.controllerActorId === actor.actorId) ||
      (actor.kind === 'participant' &&
        actor.sessionId === sessionId &&
        state.participants.some(
          (participant) =>
            participant.id === actor.participantId &&
            !participant.removedAt &&
            participant.credentialVersion === actor.credentialVersion,
        ));
    if (!allowed) throw new LiveSessionForbiddenError();
    return this.executor.snapshot(session, runtime, actor);
  }
}
