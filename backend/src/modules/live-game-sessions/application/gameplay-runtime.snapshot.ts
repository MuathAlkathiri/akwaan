import { Injectable } from '@nestjs/common';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { LiveGameSession } from '../domain/live-game-session';
import { GameplayAuthorization } from './gameplay-authorization';
import { LiveSessionActor } from './live-session-actor';
import { canSeeVisibility } from '../domain/gameplay-interaction.plugin';
import { PresentationSurfaceCapability } from '../domain/gameplay-mode.plugin';

export interface GameplayRuntimeSnapshot {
  runtimeId: string;
  sessionId: string;
  status: string;
  revision: number;
  mode: { key: string; version: number; stateSchemaVersion: number };
  modeState: Record<string, string | number | boolean | null>;
  /**
   * Fair-start multi-surface shell: only ever present while a multi-surface
   * mechanic is still awaiting activation. Carries exactly the safe surface
   * capability for this actor (and never participant ids, teams, question text,
   * options, the numeric target, correct answers, or Steal/Trust state).
   */
  presentationSurface?: {
    running: boolean;
    capability?: PresentationSurfaceCapability;
  };
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
    // Fair-start: while a mechanic that opted into presentation activation is
    // still preparing, no playable content (prompt/media/private view) may reach
    // any client. This covers both the existing single-surface mechanics (a
    // declared `requiresPresentationActivation` deadline) and the multi-surface
    // contract (a mechanic declaring `requiredPresentationSurfaces`, e.g. RYO).
    // A prepared recurring presentation re-enters the awaiting state even though
    // the INITIAL activation already happened: content is hidden again and the
    // surfaces must acknowledge the new generation before it activates.
    const recurringPreparing = state.currentPresentation?.status === 'prepared';
    const awaitingPresentation =
      recurringPreparing ||
      (!state.presentationActivatedAt &&
        (plugin.deadline?.requiresPresentationActivation === true ||
          plugin.requiredPresentationSurfaces !== undefined));
    const requiredSurfaces =
      awaitingPresentation && plugin.requiredPresentationSurfaces
        ? plugin.requiredPresentationSurfaces({
            runtimeState: state.runtimeState,
            roundState: state.activeRound?.modeState ?? {},
          })
        : undefined;
    // The safe shell: only this actor's capability (or no capability for a
    // spectator who is not part of the required set). Nothing sensitive.
    const presentationSurface = awaitingPresentation
      ? {
          running: true,
          // Safe, server-issued identity the client echoes back on its recurring
          // acknowledgement. Never any readiness/connection/count detail.
          ...(recurringPreparing && state.currentPresentation
            ? { generation: state.currentPresentation.generation }
            : {}),
          ...(requiredSurfaces
            ? (() => {
                const capability = requiredSurfaces.find((surface) => {
                  if (
                    surface.capability === 'shared' &&
                    projectionActor.controller
                  ) {
                    return true;
                  }
                  return (
                    surface.participantId !== undefined &&
                    projectionActor.participantId === surface.participantId
                  );
                })?.capability;
                return capability ? { capability } : {};
              })()
            : {}),
        }
      : undefined;
    const preparingModeState = { awaitingPresentation: true as const };
    const currentItem =
      state.modeKey === 'bomb' && projectedRound?.phase === 'presenting'
        ? {
            id: `${String(projectedRound.questionId)}:${String(
              projectedRound.itemIndex,
            )}`,
            index: Number(projectedRound.itemIndex),
            totalItems: Number(projectedRound.itemCount),
            media: {
              type:
                (projectedRound.mediaType as 'none' | 'image' | 'audio') ??
                (projectedRound.imageUrl ? 'image' : 'none'),
              url: String(
                projectedRound.mediaUrl ?? projectedRound.imageUrl ?? '',
              ),
              ...(typeof projectedRound.altText === 'string' &&
              projectedRound.altText
                ? { altText: projectedRound.altText }
                : {}),
            },
            image: {
              url: String(projectedRound.imageUrl ?? ''),
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
      presentationSurface,
      // A mechanic that owns private per-participant information projects it
      // itself; everything else keeps the one shared projection.
      modeState: awaitingPresentation
        ? preparingModeState
        : (plugin.projectRuntimeStateForActor?.(
            state.runtimeState,
            projectionActor,
          ) ?? plugin.projectRuntimeState(state.runtimeState)),
      activeRound: state.activeRound
        ? {
            id: state.activeRound.id,
            sequence: state.activeRound.sequence,
            status: state.activeRound.status,
            activeTeamId: state.activeRound.activeTeamId,
            activeParticipantId: state.activeRound.activeParticipantId,
            modeState: awaitingPresentation
              ? preparingModeState
              : projectedRound!,
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
