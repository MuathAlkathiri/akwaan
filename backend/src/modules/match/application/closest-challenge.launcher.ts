import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartClosestGameplay } from '../../live-game-sessions/application/start-closest-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  CLOSEST_ITEM_COUNT,
  CLOSEST_MODE_KEY,
  ClosestItemResult,
} from '../../live-game-sessions/domain/closest-gameplay.plugin';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

@Injectable()
export class ClosestChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = CLOSEST_MODE_KEY;
  readonly launchRequirements = {
    contentItemCount: CLOSEST_ITEM_COUNT,
    requiresPhones: true,
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.answerMode === ChallengeAnswerMode.CLOSEST,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startClosest: StartClosestGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === CLOSEST_MODE_KEY ||
      input.challengeTypeSlug === CLOSEST_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== CLOSEST_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== CLOSEST_ITEM_COUNT
    ) {
      throw new MatchDomainError(
        'CLOSEST_REQUIRES_THREE_ITEMS',
        'Closest needs exactly three distinct content items',
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startClosest.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'CLOSEST_RUNTIME_NOT_CREATED',
        'The Closest runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return runtime.runtimeState?.phase === 'completed';
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const results = this.parseResults(runtime.runtimeState?.resultsJson);
    const teamIds = this.parseTeams(runtime.runtimeState?.teamIdsJson);
    const mechanicTotals = Object.fromEntries(teamIds.map((id) => [id, 0]));
    for (const result of results) {
      if (result.winnerTeamId) mechanicTotals[result.winnerTeamId] += 1;
    }
    const [teamA, teamB] = teamIds;
    const winnerTeamId =
      mechanicTotals[teamA] === mechanicTotals[teamB]
        ? null
        : mechanicTotals[teamA] > mechanicTotals[teamB]
          ? teamA
          : teamB;
    return {
      challengeKey: this.key,
      winnerTeamId,
      mechanicSummary: mechanicTotals,
      details: {
        itemsPlayed: results.length,
        items: results,
        mechanicTotals,
        tie: winnerTeamId === null,
      },
    };
  }

  private parseResults(value: unknown): ClosestItemResult[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ClosestItemResult[]) : [];
    } catch {
      return [];
    }
  }

  private parseTeams(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}
