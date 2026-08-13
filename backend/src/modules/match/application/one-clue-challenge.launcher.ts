import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartOneClueGameplay } from '../../live-game-sessions/application/start-one-clue-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  ONE_CLUE_ITEM_COUNT,
  ONE_CLUE_MODE_KEY,
  OneClueItemResult,
} from '../../live-game-sessions/domain/one-clue-gameplay.plugin';
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
export class OneClueChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = ONE_CLUE_MODE_KEY;
  readonly launchRequirements = {
    contentItemCount: ONE_CLUE_ITEM_COUNT,
    requiresPhones: true,
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.answerMode === ChallengeAnswerMode.MATCH,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly start: StartOneClueGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === ONE_CLUE_MODE_KEY ||
      input.challengeTypeSlug === ONE_CLUE_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== ONE_CLUE_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== ONE_CLUE_ITEM_COUNT
    ) {
      throw new MatchDomainError(
        'ONE_CLUE_REQUIRES_THREE_ITEMS',
        'One Clue needs exactly three distinct content items',
      );
    }
  }

  async launch(context: MatchChallengeLaunchContext) {
    await this.start.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'ONE_CLUE_RUNTIME_NOT_CREATED',
        'The One Clue runtime was not created',
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
    const results = this.parse<OneClueItemResult[]>(
      runtime.runtimeState?.resultsJson,
      [],
    );
    const teamIds = this.parse<string[]>(runtime.runtimeState?.teamIdsJson, []);
    const mechanicTotals = Object.fromEntries(teamIds.map((id) => [id, 0]));
    for (const result of results) {
      for (const teamId of teamIds) {
        mechanicTotals[teamId] += result.points[teamId] ?? 0;
      }
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

  private parse<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string') return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
