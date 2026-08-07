import { Inject, Injectable, Logger } from '@nestjs/common';
import { GameplayAuthorization } from './gameplay-authorization';
import {
  GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
  GameplayTransactionContext,
  GameplayTransactionUnitOfWork,
} from './gameplay-transaction.unit-of-work';
import { GameplayRuntimeSnapshotMapper } from './gameplay-runtime.snapshot';
import { LiveSessionActor } from './live-session-actor';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from './live-session-transition.publisher';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { LiveGameSession } from '../domain/live-game-session';
import {
  GameplayRuntimeNotFoundError,
  LiveSessionDomainError,
  LiveSessionForbiddenError,
  LiveSessionNotFoundError,
} from '../domain/live-session.errors';
import { GameplayCommandPayload } from '../domain/gameplay-mode.plugin';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { ScoringService } from '../../scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import {
  advanceRyoChallengeState,
  RYO_MODE_KEY,
  ryoAnsweringTeam,
} from '../domain/ryo-gameplay.plugin';

export interface InteractionMutationCommand {
  sessionId: string;
  roundId: string;
  actor: LiveSessionActor;
  commandId: string;
  expectedSessionRevision: number;
  expectedRuntimeRevision: number;
  expectedInteractionRevision?: number;
  clientTimestamp?: string;
}

@Injectable()
export class GameplayInteractionUseCases {
  private readonly logger = new Logger(GameplayInteractionUseCases.name);

  constructor(
    @Inject(GAMEPLAY_TRANSACTION_UNIT_OF_WORK)
    private readonly unitOfWork: GameplayTransactionUnitOfWork,
    private readonly modes: GameplayModeRegistry,
    private readonly authorization: GameplayAuthorization,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
    private readonly sessionSnapshots: LiveGameSessionSnapshotMapper,
    private readonly gameplaySnapshots: GameplayRuntimeSnapshotMapper,
    private readonly observers: GameplayObserverRegistry,
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
    private readonly scoring: ScoringService,
  ) {}

  prepare(
    command: InteractionMutationCommand & { payload: GameplayCommandPayload },
  ) {
    return this.runtimeMutation(
      'interaction-prepared',
      command,
      'controller',
      (session, runtime, now) => {
        const state = runtime.serialize();
        this.assertRound(command.roundId, state.activeRound?.id);
        const plugin = this.requireInteractionPlugin(runtime);
        const prompt = plugin.preparePrompt(
          {
            sessionId: session.id,
            runtimeId: runtime.id,
            roundId: command.roundId,
            activeTeamId: state.activeRound?.activeTeamId,
            activeParticipantId: state.activeRound?.activeParticipantId,
          },
          command.payload,
          now,
        );
        runtime.prepareInteraction(
          prompt,
          command.commandId,
          command.actor.actorId,
          now,
        );
      },
    );
  }

  open(command: InteractionMutationCommand) {
    return this.interactionMutation(
      'interaction-opened',
      command,
      'controller',
      (i, now) => i.open(now),
    );
  }

  close(command: InteractionMutationCommand) {
    return this.interactionMutation(
      'interaction-closed',
      command,
      'controller',
      (i, now) => i.close(now),
    );
  }

  cancel(command: InteractionMutationCommand) {
    return this.interactionMutation(
      'interaction-cancelled',
      command,
      'controller',
      (i, now) => i.cancel(now),
    );
  }

  expire(command: InteractionMutationCommand) {
    return this.interactionMutation(
      'interaction-expired',
      command,
      'controller',
      (i, now) => i.expire(now),
    );
  }

  submit(
    command: InteractionMutationCommand & { payload: GameplayCommandPayload },
  ) {
    return this.runtimeMutation(
      'submission-received',
      command,
      undefined,
      (session, runtime, now) => {
        if (command.actor.kind !== 'participant') {
          throw new LiveSessionForbiddenError();
        }
        const participantActor = command.actor;
        const state = runtime.serialize();
        this.assertRound(command.roundId, state.activeRound?.id);
        const plugin = this.requireInteractionPlugin(runtime);
        this.authorization.assert(
          plugin.submissionAuthorization,
          command.actor,
          session.serialize(),
          state,
        );
        const interaction = state.activeRound?.interaction;
        if (!interaction) throw this.interactionNotFound();
        this.assertInteractionRevision(
          interaction.revision,
          command.expectedInteractionRevision,
        );
        if (
          plugin.submissionPolicy === 'one-per-participant' &&
          interaction.submissions.some(
            (submission) =>
              submission.participantId === participantActor.participantId &&
              !['withdrawn', 'superseded'].includes(submission.status),
          )
        ) {
          if (interaction.processedRequestIds.includes(command.commandId))
            return;
          throw new LiveSessionDomainError(
            'SUBMISSION_POLICY_VIOLATION',
            'Participant already submitted',
          );
        }
        const participant = session
          .serialize()
          .participants.find(
            (candidate) => candidate.id === participantActor.participantId,
          );
        const actorProjection = {
          controller: false,
          participantId: participantActor.participantId,
          teamId: participant?.teamId,
          activeTeamId: state.activeRound?.activeTeamId,
        };
        const validatedPayload = plugin.validateSubmissionForActor
          ? plugin.validateSubmissionForActor(
              command.payload,
              actorProjection,
              interaction.prompt,
            )
          : plugin.validateSubmission(command.payload);
        runtime.submitInteraction({
          participantId: participantActor.participantId,
          teamId: participant?.teamId,
          type: 'development-signal',
          schemaVersion: 1,
          payload: validatedPayload,
          clientTimestamp: command.clientTimestamp,
          requestId: command.commandId,
          resultVisibility: 'submitting-participant',
          now,
          actorId: participantActor.actorId,
        });
        const updated = runtime.serialize().activeRound?.interaction;
        if (
          updated &&
          plugin.shouldAutoResolve?.(updated.submissions, updated.prompt)
        ) {
          runtime.mutateInteraction(
            `${command.commandId}:auto-close`,
            'system',
            now,
            (value) => {
              value.close(now);
              for (const candidate of updated.submissions) {
                if (candidate.status === 'pending-adjudication') {
                  value.adjudicate(
                    candidate.id,
                    true,
                    'auto-accepted',
                    {},
                    now,
                  );
                }
              }
            },
            'interaction-auto-closed',
          );
          const adjudicated = runtime.serialize().activeRound?.interaction;
          if (!adjudicated) throw this.interactionNotFound();
          const result = plugin.createOutcome(
            adjudicated.submissions,
            now,
            adjudicated.prompt,
          );
          runtime.resolveInteraction(
            plugin.validateOutcome(result.outcome),
            `${command.commandId}:auto-resolve`,
            'system',
            now,
            session.revision,
          );
          this.applyRyoResolution(runtime, session, result.outcome, now);
        }
      },
    );
  }

  private applyRyoResolution(
    runtime: GameplayRuntime,
    session: LiveGameSession,
    outcome: import('../domain/gameplay-interaction').GameplayOutcomeState,
    now: Date,
  ): void {
    if (runtime.modeKey !== RYO_MODE_KEY) return;
    const state = runtime.serialize();
    const round = state.activeRound;
    if (!round || typeof outcome.privatePayload.scoringInputJson !== 'string') {
      throw new LiveSessionDomainError(
        'INVALID_RYO_OUTCOME',
        'RYO scoring facts are missing',
      );
    }
    const scoringInput = JSON.parse(
      outcome.privatePayload.scoringInputJson,
    ) as Parameters<
      import('../../scoring/application/ryo-payoff-matrix.rule').RyoPayoffMatrixRule['calculate']
    >[0];
    const events = this.scoring.score(
      SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      scoringInput,
      { matchId: session.id, challengeSessionId: runtime.id, occurredAt: now },
    );
    const runtimeState = advanceRyoChallengeState(
      state.runtimeState,
      events[0] as unknown as Record<string, unknown>,
      outcome.publicPayload,
    );
    const nextIndex = Number(runtimeState.currentItemIndex);
    runtime.applyModeState({
      commandId: `${events[0].id}:state`,
      actorId: 'system',
      runtimeState,
      roundState: {
        ...round.modeState,
        phase: nextIndex === 3 ? 'completed' : 'resolved',
      },
      eventType: 'ryo-item-resolved',
      eventPayload: { itemIndex: nextIndex - 1 },
      now,
      sessionRevision: session.revision,
    });
    if (nextIndex === 3) {
      runtime.completeRound({
        roundId: round.id,
        commandId: `${events[0].id}:round`,
        actorId: 'system',
        reason: 'ryo-three-items-completed',
        result: {
          scoreEventsJson: runtimeState.scoreEventsJson,
          resultsJson: runtimeState.resultsJson,
        },
        now,
      });
      runtime.complete(`${events[0].id}:challenge`, 'system', now);
      return;
    }
    const items = JSON.parse(String(runtimeState.itemsJson)) as Array<
      Record<string, unknown>
    >;
    const teams = JSON.parse(String(runtimeState.teamIdsJson)) as string[];
    const starting = String(runtimeState.startingTeamId);
    const answeringTeamId = ryoAnsweringTeam(teams, starting, nextIndex);
    const opposingTeamId = teams.find((id) => id !== answeringTeamId)!;
    runtime.applyModeState({
      commandId: `${events[0].id}:advance`,
      actorId: 'system',
      runtimeState: { ...runtimeState, phase: 'collecting' },
      roundState: {
        phase: 'collecting',
        itemIndex: nextIndex,
        answeringTeamId,
        opposingTeamId,
      },
      eventType: 'ryo-item-advanced',
      eventPayload: { itemIndex: nextIndex },
      now,
      sessionRevision: session.revision,
      activeTeamId: answeringTeamId,
    });
    const plugin = this.requireInteractionPlugin(runtime);
    const item = { ...items[nextIndex], itemIndex: nextIndex };
    runtime.prepareInteraction(
      plugin.preparePrompt(
        {
          sessionId: session.id,
          runtimeId: runtime.id,
          roundId: round.id,
          activeTeamId: answeringTeamId,
        },
        { itemJson: JSON.stringify(item), opposingTeamId },
        now,
      ),
      `${events[0].id}:prompt`,
      'system',
      now,
    );
    runtime.mutateInteraction(
      `${events[0].id}:open`,
      'system',
      now,
      (value) => value.open(now),
      'interaction-opened',
    );
  }

  withdraw(command: InteractionMutationCommand & { submissionId: string }) {
    if (command.actor.kind !== 'participant') {
      throw new LiveSessionForbiddenError();
    }
    return this.interactionMutation(
      'submission-withdrawn',
      command,
      undefined,
      (interaction, now) =>
        interaction.withdraw(
          command.submissionId,
          command.actor.kind === 'participant'
            ? command.actor.participantId
            : '',
          now,
        ),
    );
  }

  adjudicate(
    command: InteractionMutationCommand & {
      submissionId: string;
      accepted: boolean;
      reasonCode: string;
    },
  ) {
    return this.interactionMutation(
      'submission-adjudicated',
      command,
      'controller',
      (interaction, now) =>
        interaction.adjudicate(
          command.submissionId,
          command.accepted,
          command.reasonCode,
          {},
          now,
        ),
    );
  }

  resolve(command: InteractionMutationCommand) {
    return this.transaction(command, async (context, session, runtime, now) => {
      this.assertController(session, command.actor);
      const runtimeState = runtime.serialize();
      this.assertRound(command.roundId, runtimeState.activeRound?.id);
      const interaction = runtimeState.activeRound?.interaction;
      if (!interaction) throw this.interactionNotFound();
      if (
        interaction.status === 'resolved' &&
        interaction.processedRequestIds.includes(command.commandId)
      ) {
        return;
      }
      this.assertInteractionRevision(
        interaction.revision,
        command.expectedInteractionRevision,
      );
      const plugin = this.requireInteractionPlugin(runtime);
      const result = plugin.createOutcome(
        interaction.submissions,
        now,
        interaction.prompt,
      );
      const outcome = plugin.validateOutcome(result.outcome);
      const previousSessionRevision = session.revision;
      for (const effect of result.effects) {
        if (effect.type === 'switch-active-team') {
          session.switchTurn(effect.teamId || undefined, effect.reason, now);
          this.logger.log({
            event: 'gameplay_session_effect_applied',
            effect: effect.type,
            sessionId: session.id,
            runtimeId: runtime.id,
          });
        } else if (effect.type !== 'emit-runtime-event') {
          throw new LiveSessionDomainError(
            'UNSUPPORTED_GAMEPLAY_EFFECT',
            `Interaction resolution does not support ${effect.type}`,
          );
        }
      }
      session.completeCommand(command.commandId, now);
      runtime.resolveInteraction(
        outcome,
        command.commandId,
        command.actor.actorId,
        now,
        session.revision,
      );
      await context.saveSession(session, previousSessionRevision);
    });
  }

  private interactionMutation(
    event: string,
    command: InteractionMutationCommand,
    requirement: 'controller' | undefined,
    mutate: (
      interaction: import('../domain/gameplay-interaction').GameplayInteraction,
      now: Date,
    ) => void,
  ) {
    return this.runtimeMutation(
      event,
      command,
      requirement,
      (_session, runtime, now) => {
        const state = runtime.serialize();
        this.assertRound(command.roundId, state.activeRound?.id);
        const interaction = state.activeRound?.interaction;
        if (!interaction) throw this.interactionNotFound();
        this.assertInteractionRevision(
          interaction.revision,
          command.expectedInteractionRevision,
        );
        runtime.mutateInteraction(
          command.commandId,
          command.actor.actorId,
          now,
          mutate,
          event,
        );
      },
    );
  }

  private runtimeMutation(
    event: string,
    command: InteractionMutationCommand,
    requirement: 'controller' | undefined,
    mutate: (
      session: LiveGameSession,
      runtime: GameplayRuntime,
      now: Date,
    ) => void,
  ) {
    return this.transaction(
      command,
      async (_context, session, runtime, now) => {
        if (requirement === 'controller') {
          this.assertController(session, command.actor);
        }
        mutate(session, runtime, now);
        this.logger.log({
          event,
          sessionId: session.id,
          runtimeId: runtime.id,
          roundId: command.roundId,
          actorId: command.actor.actorId,
          commandId: command.commandId,
        });
      },
    );
  }

  private async transaction(
    command: InteractionMutationCommand,
    mutate: (
      context: GameplayTransactionContext,
      session: LiveGameSession,
      runtime: GameplayRuntime,
      now: Date,
    ) => Promise<void>,
  ) {
    const result = await this.unitOfWork.execute(async (context) => {
      const session = await context.findSession(command.sessionId);
      if (!session) throw new LiveSessionNotFoundError(command.sessionId);
      const runtime = await context.findRuntime(command.sessionId);
      if (!runtime) throw new GameplayRuntimeNotFoundError(command.sessionId);
      if (
        command.actor.kind === 'participant' &&
        command.actor.sessionId !== command.sessionId
      ) {
        throw new LiveSessionForbiddenError();
      }
      if (runtime.isDuplicate(command.commandId)) {
        return { session, runtime, now: this.clock.now() };
      }
      session.assertRevision(command.expectedSessionRevision);
      runtime.assertRevision(command.expectedRuntimeRevision);
      const previousRuntimeRevision = runtime.revision;
      const now = this.clock.now();
      await mutate(context, session, runtime, now);
      await context.saveRuntime(runtime, previousRuntimeRevision);
      return { session, runtime, now };
    });
    const snapshot = this.sessionSnapshots.toSnapshot(
      result.session,
      command.actor.kind === 'participant'
        ? command.actor.participantId
        : command.actor.actorId,
      result.now,
    );
    snapshot.availableActions = snapshot.availableActions.filter(
      (action) => action !== 'runtime:create',
    );
    snapshot.gameplay = this.gameplaySnapshots.toSnapshot(
      result.runtime,
      result.session,
      command.actor,
      result.now,
    );
    // `publishEvent` emits the name verbatim, and every client listener is
    // namespaced. Published bare, this reached nobody: a submission that resolved
    // an item and opened the next one told no phone about it, so the players sat
    // on the finished question until something else happened to resync them.
    this.publisher.publishEvent(
      command.sessionId,
      'live-session:interaction-changed',
      {
        runtimeId: result.runtime.id,
        runtimeRevision: result.runtime.revision,
        sessionRevision: result.session.revision,
      },
    );
    // Committed outside the transaction on purpose: reconciliation must never be
    // able to roll back gameplay that already succeeded.
    await this.observers.notifyRuntimeMutated({
      sessionId: command.sessionId,
      runtimeId: result.runtime.id,
      runtimeState: result.runtime.serialize(),
    });
    return this.observers.enrichSnapshot(snapshot, command.actor);
  }

  private requireInteractionPlugin(runtime: GameplayRuntime) {
    const plugin = this.modes.resolve(runtime.modeKey, runtime.modeVersion);
    if (!plugin.interaction) {
      throw new LiveSessionDomainError(
        'INTERACTIONS_UNSUPPORTED',
        'Gameplay mode does not support interactions',
      );
    }
    return plugin.interaction;
  }

  private assertController(
    session: LiveGameSession,
    actor: LiveSessionActor,
  ): void {
    if (actor.kind !== 'user' || session.controllerActorId !== actor.actorId) {
      throw new LiveSessionForbiddenError();
    }
  }

  private assertRound(expected: string, actual?: string): void {
    if (expected !== actual) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_ROUND_NOT_FOUND',
        'Interaction does not belong to the active round',
      );
    }
  }

  private assertInteractionRevision(actual: number, expected?: number): void {
    if (expected === undefined || expected !== actual) {
      throw new LiveSessionDomainError(
        'STALE_INTERACTION_REVISION',
        `Expected interaction revision ${String(expected)}, found ${actual}`,
      );
    }
  }

  private interactionNotFound() {
    return new LiveSessionDomainError(
      'INTERACTION_NOT_FOUND',
      'No interaction exists for the active round',
    );
  }
}
