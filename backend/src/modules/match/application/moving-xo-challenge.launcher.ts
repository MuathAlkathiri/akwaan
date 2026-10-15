import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import {
  MOVING_XO_GAMEPLAY_PLUGIN,
  movingXoResult,
} from '../../live-game-sessions/domain/moving-xo-gameplay.plugin';
import { MOVING_XO_MODE_KEY } from '../../live-game-sessions/domain/moving-xo-board';
import { StartMovingXoGameplay } from '../../live-game-sessions/application/start-moving-xo-gameplay.use-case';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLaunchRequirements,
  MatchChallengeLauncher,
} from './challenge-launcher.registry';
import {
  isMovingXoPlayableItem,
  movingXoMinimumUsableItems,
} from './moving-xo-content.policy';

/**
 * "Moving XO" on a Match board.
 *
 * The second launcher that asks for **no content at launch**. §23.11 fixes no
 * question count: the challenge consumes as many eligible items as the game
 * actually requires, one per turn. A launch-time deck would both reserve content
 * the game may never reach and destroy the on-demand model the mechanic is built
 * on, so `contentItemCount: 0` is a deliberate declaration, not an omission.
 */
@Injectable()
export class MovingXoChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = MOVING_XO_MODE_KEY;
  readonly launchRequirements: MatchChallengeLaunchRequirements;

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startMovingXo: StartMovingXoGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    config: ConfigService,
  ) {
    this.launchRequirements = {
      // Nothing is drawn or reserved up front; every puzzle arrives on demand.
      contentItemCount: 0,
      // Account-specific launch safety. Counting uses the selector's exact
      // READY/Scope/mechanic/exposure/reservation/runtime-shape predicates.
      minimumUsableContentItems: movingXoMinimumUsableItems(config),
      isPlayableItem: isMovingXoPlayableItem,
      requiresPhones: true,
      readiness: {
        minParticipantsPerTeam: 1,
        requiresBothTeams: true,
        requiresTeamAssignment: true,
        requiresConnectedPresence: true,
      },
    };
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === MOVING_XO_MODE_KEY ||
      input.challengeTypeSlug === MOVING_XO_MODE_KEY
    );
  }

  validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (context.contentItemIds.length) {
      throw new MatchDomainError(
        'MOVING_XO_TAKES_NO_LAUNCH_CONTENT',
        'Moving XO draws its puzzles on demand and accepts none at launch',
      );
    }
    if (!context.startingTeamId) {
      throw new MatchDomainError(
        'MOVING_XO_STARTING_TEAM_REQUIRED',
        'Moving XO requires the canonical Match turn owner',
      );
    }
    return Promise.resolve();
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startMovingXo.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      // §23.11: whichever team already owns the canonical Match turn starts.
      // There is no coin flip and no separate first-player selection here.
      startingTeamId: context.startingTeamId,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'MOVING_XO_RUNTIME_NOT_CREATED',
        'The Moving XO runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /**
   * Delegated to the mechanic, which alone knows what it has presented.
   *
   * Gated on both Fair-Start windows, because an on-demand mechanic draws its
   * first puzzle inside the launch: until the one-time activation, nothing has
   * been presented at all, and after it a generation that is still `prepared` is
   * committed but hidden. A puzzle nobody has seen must not be spent — an
   * abandoned challenge has to cost the account nothing.
   */
  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    const runtimeState = input.runtime.runtimeState;
    if (!runtimeState || !MOVING_XO_GAMEPLAY_PLUGIN.presentedContentItemIds) {
      return [];
    }
    if (
      (MOVING_XO_GAMEPLAY_PLUGIN.deadline?.requiresPresentationActivation &&
        !input.runtime.presentationActivatedAt) ||
      input.runtime.currentPresentation?.status === 'prepared'
    ) {
      return [];
    }
    return MOVING_XO_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState,
      roundState: input.runtime.activeRound?.modeState ?? {},
      // Moving XO's runtime carries its own content ids, so the Match binding —
      // which is empty for this mechanic — is not consulted.
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return movingXoResult(runtime.runtimeState ?? {}) !== undefined;
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const result = movingXoResult(runtime.runtimeState ?? {});
    return {
      challengeKey: this.key,
      // The mechanic's own verdict, verbatim. A draw and a depleted catalog both
      // have no winner, and that stays null rather than becoming a fabricated
      // victory for whoever happened to be holding the turn.
      winnerTeamId: result?.winnerTeamId ?? null,
      details: {
        endedBy: result?.endedBy ?? 'finish',
        successfulMoveCount: result?.successfulMoveCount ?? 0,
        questionsPresented: result?.questionsPresented ?? 0,
        decisivePhase: result?.decisivePhase ?? false,
      },
    };
  }
}
