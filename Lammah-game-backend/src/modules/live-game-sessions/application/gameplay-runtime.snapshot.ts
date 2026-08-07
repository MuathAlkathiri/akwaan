import { Injectable } from '@nestjs/common';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { LiveGameSession } from '../domain/live-game-session';
import { GameplayAuthorization } from './gameplay-authorization';
import { LiveSessionActor } from './live-session-actor';
import { canSeeVisibility } from '../domain/gameplay-interaction.plugin';

export interface GameplayRuntimeSnapshot {
  runtimeId: string;
  sessionId: string;
  status: string;
  revision: number;
  mode: { key: string; version: number; stateSchemaVersion: number };
  modeState: Record<string, string | number | boolean | null>;
  activeRound?: {
    id: string;
    sequence: number;
    status: string;
    activeTeamId?: string;
    activeParticipantId?: string;
    modeState: Record<string, string | number | boolean | null>;
    transitionRevision: number;
    createdAt: string;
    startedAt?: string;
    pausedAt?: string;
    resumedAt?: string;
    interaction?: {
      id: string;
      revision: number;
      status: string;
      prompt?: {
        id: string;
        type: string;
        schemaVersion: number;
        payload: Record<string, string | number | boolean | null>;
        visibleFrom?: string;
        deadlineAt?: string;
        metadata: Record<string, string | number | boolean | null>;
      };
      submissions: Array<{
        id: string;
        status: string;
        payload: Record<string, string | number | boolean | null>;
        receivedAt: string;
      }>;
      outcome?: {
        type: string;
        schemaVersion: number;
        payload: Record<string, string | number | boolean | null>;
        completionReason: string;
      };
    };
  };
  round?: { id: string; status: string };
  currentItem?: {
    id: string;
    index: number;
    totalItems: number;
    image: { url: string; altText?: string };
  };
  prompt?: string;
  activeTeamId?: string;
  completedRounds: Array<{
    id: string;
    sequence: number;
    completedAt: string;
    completionReason: string;
  }>;
  transitions: Array<{
    revision: number;
    type: string;
    roundId?: string;
    timestamp: string;
  }>;
  availableActions: string[];
  serverTimestamp: string;
}

@Injectable()
export class GameplayRuntimeSnapshotMapper {
  constructor(
    private readonly modes: GameplayModeRegistry,
    private readonly authorization: GameplayAuthorization,
  ) {}

  toSnapshot(
    runtime: GameplayRuntime,
    session: LiveGameSession,
    actor: LiveSessionActor,
    now: Date,
  ): GameplayRuntimeSnapshot {
    const state = runtime.serialize();
    const sessionState = session.serialize();
    const plugin = this.modes.resolve(state.modeKey, state.modeVersion);
    const participant = sessionState.participants.find((candidate) =>
      actor.kind === 'participant'
        ? candidate.id === actor.participantId
        : candidate.actorId === actor.actorId,
    );
    const projectionActor = {
      controller:
        actor.kind === 'user' &&
        sessionState.controllerActorId === actor.actorId,
      participantId: participant?.id,
      teamId: participant?.teamId,
      activeTeamId: state.activeRound?.activeTeamId,
    };
    const interaction = state.activeRound?.interaction;
    const interactionPlugin = plugin.interaction;
    const projectedRound = state.activeRound
      ? plugin.projectRoundState(state.activeRound.modeState)
      : undefined;
    const currentItem =
      state.modeKey === 'bomb' &&
      projectedRound?.phase === 'presenting' &&
      typeof projectedRound.imageUrl === 'string'
        ? {
            id: `${String(projectedRound.questionId)}:${String(
              projectedRound.itemIndex,
            )}`,
            index: Number(projectedRound.itemIndex),
            totalItems: Number(projectedRound.itemCount),
            image: {
              url: projectedRound.imageUrl,
              ...(typeof projectedRound.altText === 'string' &&
              projectedRound.altText
                ? { altText: projectedRound.altText }
                : {}),
            },
          }
        : undefined;
    return {
      runtimeId: state.id,
      sessionId: state.sessionId,
      status: state.status,
      revision: state.revision,
      mode: {
        key: state.modeKey,
        version: state.modeVersion,
        stateSchemaVersion: state.stateSchemaVersion,
      },
      // A mechanic that owns private per-participant information projects it
      // itself; everything else keeps the one shared projection.
      modeState:
        plugin.projectRuntimeStateForActor?.(
          state.runtimeState,
          projectionActor,
        ) ?? plugin.projectRuntimeState(state.runtimeState),
      activeRound: state.activeRound
        ? {
            id: state.activeRound.id,
            sequence: state.activeRound.sequence,
            status: state.activeRound.status,
            activeTeamId: state.activeRound.activeTeamId,
            activeParticipantId: state.activeRound.activeParticipantId,
            modeState: projectedRound!,
            transitionRevision: state.activeRound.transitionRevision,
            createdAt: state.activeRound.createdAt.toISOString(),
            startedAt: state.activeRound.startedAt?.toISOString(),
            pausedAt: state.activeRound.pausedAt?.toISOString(),
            resumedAt: state.activeRound.resumedAt?.toISOString(),
            interaction:
              interaction && interactionPlugin
                ? {
                    id: interaction.id,
                    revision: interaction.revision,
                    status: interaction.status,
                    prompt: canSeeVisibility(
                      interaction.prompt.visibility,
                      projectionActor,
                      {},
                      interaction.status,
                    )
                      ? {
                          id: interaction.prompt.id,
                          type: interaction.prompt.type,
                          schemaVersion: interaction.prompt.schemaVersion,
                          payload:
                            interactionPlugin.projectPrompt(
                              interaction.prompt,
                              projectionActor,
                              state.runtimeState,
                            ) ?? {},
                          visibleFrom:
                            interaction.prompt.visibleFrom?.toISOString(),
                          deadlineAt:
                            interaction.prompt.deadlineAt?.toISOString(),
                          metadata: interaction.prompt.metadata,
                        }
                      : undefined,
                    submissions: interaction.submissions.flatMap(
                      (submission) => {
                        const payload = interactionPlugin.projectSubmission(
                          submission,
                          projectionActor,
                        );
                        return payload
                          ? [
                              {
                                id: submission.id,
                                status: submission.status,
                                payload,
                                receivedAt: submission.receivedAt.toISOString(),
                              },
                            ]
                          : [];
                      },
                    ),
                    outcome: interaction.outcome
                      ? {
                          type: interaction.outcome.type,
                          schemaVersion: interaction.outcome.schemaVersion,
                          payload:
                            interactionPlugin.projectOutcome(
                              interaction.outcome,
                              projectionActor,
                            ) ?? {},
                          completionReason:
                            interaction.outcome.completionReason,
                        }
                      : undefined,
                  }
                : undefined,
          }
        : undefined,
      round: state.activeRound
        ? { id: state.activeRound.id, status: state.activeRound.status }
        : undefined,
      currentItem,
      prompt:
        typeof projectedRound?.prompt === 'string'
          ? projectedRound.prompt
          : undefined,
      activeTeamId: state.activeRound?.activeTeamId,
      completedRounds: state.completedRounds.map((round) => ({
        ...round,
        completedAt: round.completedAt.toISOString(),
      })),
      transitions: state.transitions.slice(-20).map((transition) => ({
        revision: transition.revision,
        type: transition.type,
        roundId: transition.roundId,
        timestamp: transition.timestamp.toISOString(),
      })),
      availableActions: this.authorization.availableActions(
        actor,
        sessionState,
        state,
        plugin,
      ),
      serverTimestamp: now.toISOString(),
    };
  }
}
