import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import {
  MARHALA_GAMEPLAY_PLUGIN,
  marhalaResult,
} from '../../live-game-sessions/domain/marhala-gameplay.plugin';
import { MARHALA_MODE_KEY } from '../../live-game-sessions/domain/marhala-board';
import { StartMarhalaGameplay } from '../../live-game-sessions/application/start-marhala-gameplay.use-case';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
} from './challenge-launcher.registry';

/**
 * "المرحلة" on a Match board.
 *
 * The one launcher that asks for **no content at launch**. Marhala draws a single
 * question each time a team commits to a difficulty, so a launch-time deck would
 * both reserve content the race may never reach and destroy the on-demand model
 * the mechanic is built on. `contentItemCount: 0` is a deliberate declaration, not
 * an omission.
 */
@Injectable()
export class MarhalaChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = MARHALA_MODE_KEY;
  readonly launchRequirements = {
    // Nothing is drawn or reserved up front; every question arrives on demand.
    contentItemCount: 0,
    requiresPhones: true,
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startMarhala: StartMarhalaGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === MARHALA_MODE_KEY ||
      input.challengeTypeSlug === MARHALA_MODE_KEY
    );
  }

  validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (context.contentItemIds.length) {
      throw new MatchDomainError(
        'MARHALA_TAKES_NO_LAUNCH_CONTENT',
        'المرحلة draws its questions on demand and accepts none at launch',
      );
    }
    return Promise.resolve();
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startMarhala.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'MARHALA_RUNTIME_NOT_CREATED',
        'The المرحلة runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** Delegated to the mechanic, which alone knows what it has presented. */
  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    const runtimeState = input.runtime.runtimeState;
    if (!runtimeState || !MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds) {
      return [];
    }
    return MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState,
      roundState: input.runtime.activeRound?.modeState ?? {},
      // Marhala's runtime carries its own content ids, so the Match binding — which
      // is empty for this mechanic — is not consulted.
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return marhalaResult(runtime.runtimeState ?? {}) !== undefined;
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const result = marhalaResult(runtime.runtimeState ?? {});
    return {
      challengeKey: this.key,
      // The mechanic's own verdict, verbatim. A race nobody finished has no
      // winner, and that stays null rather than becoming a fabricated victory.
      winnerTeamId: result?.winnerTeamId ?? null,
      // Board progress as provenance for the Match point, never as Match score.
      ...(result ? { mechanicSummary: result.positions } : {}),
      details: {
        endedBy: result?.endedBy ?? 'finish',
        positions: result?.positions ?? {},
        turnsPlayed: result?.turnsPlayed ?? 0,
      },
    };
  }
}
