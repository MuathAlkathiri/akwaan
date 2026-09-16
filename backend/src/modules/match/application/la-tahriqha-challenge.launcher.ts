import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartLaTahriqhaGameplay } from '../../live-game-sessions/application/start-la-tahriqha-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  LA_TAHRIQHA_DISH_COUNT,
  LA_TAHRIQHA_GAMEPLAY_PLUGIN,
  LA_TAHRIQHA_MODE_KEY,
  LaTahriqhaChallengeResult,
  LaTahriqhaDishResult,
} from '../../live-game-sessions/domain/la-tahriqha-gameplay.plugin';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

/**
 * How a "لا تحرقها" challenge is opened and how it hands its result back.
 *
 * Three dishes are drawn once and played to the end. The internal dish points —
 * 3, 4, 7 or a burn — never touch the Match score directly: they decide who won
 * this Signature, and the Match converges that single verdict once through the
 * canonical `challenge-win` path, exactly as every other mechanic does. A level
 * total is reported as a tie rather than broken by a fourth dish.
 */
@Injectable()
export class LaTahriqhaChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = LA_TAHRIQHA_MODE_KEY;
  readonly launchRequirements = {
    contentItemCount: LA_TAHRIQHA_DISH_COUNT,
    requiresPhones: true,
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.answerMode === ChallengeAnswerMode.LA_TAHRIQHA,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startLaTahriqha: StartLaTahriqhaGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === LA_TAHRIQHA_MODE_KEY ||
      input.challengeTypeSlug === LA_TAHRIQHA_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== LA_TAHRIQHA_DISH_COUNT ||
      new Set(context.contentItemIds).size !== LA_TAHRIQHA_DISH_COUNT
    ) {
      throw new MatchDomainError(
        'LA_TAHRIQHA_REQUIRES_THREE_DISHES',
        'لا تحرقها needs exactly three distinct dishes',
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startLaTahriqha.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'LA_TAHRIQHA_RUNTIME_NOT_CREATED',
        'The لا تحرقها runtime was not created',
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
    if (!runtimeState || !LA_TAHRIQHA_GAMEPLAY_PLUGIN.presentedContentItemIds)
      return [];
    // Fair-start: selection is not exposure. Until gameplay is activated the
    // first dish has not been shown to anyone, so it is not spent — an abort
    // before activation returns all three. Keyed off the plugin's own opt-in.
    if (
      LA_TAHRIQHA_GAMEPLAY_PLUGIN.deadline?.source === 'runtime-state' &&
      LA_TAHRIQHA_GAMEPLAY_PLUGIN.deadline.requiresPresentationActivation &&
      !input.runtime.presentationActivatedAt
    ) {
      return [];
    }
    return LA_TAHRIQHA_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState,
      roundState: input.runtime.activeRound?.modeState ?? {},
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return runtime.runtimeState?.phase === 'completed';
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const dishes = this.parseDishes(runtime.runtimeState?.resultsJson);
    const outcome = this.parseOutcome(runtime.runtimeState?.resultJson);
    const totals =
      outcome?.totals ??
      dishes.reduce<Record<string, number>>((running, dish) => {
        for (const team of dish.teams) {
          running[team.teamId] = (running[team.teamId] ?? 0) + team.points;
        }
        return running;
      }, {});
    return {
      challengeKey: this.key,
      winnerTeamId: outcome?.winnerTeamId ?? null,
      mechanicSummary: totals,
      details: {
        dishesPlayed: dishes.length,
        dishes,
        mechanicTotals: totals,
        // The two things that make a لا تحرقها recap readable at a glance: how
        // often somebody reached for the fifth card and got it, and how often
        // one wrong card cost a whole dish.
        burns: dishes.reduce(
          (count, dish) =>
            count + dish.teams.filter((team) => team.burned).length,
          0,
        ),
        perfectDishes: dishes.reduce(
          (count, dish) =>
            count + dish.teams.filter((team) => team.perfect).length,
          0,
        ),
        tie: outcome?.tie ?? false,
      },
    };
  }

  private parseDishes(value: unknown): LaTahriqhaDishResult[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as LaTahriqhaDishResult[]) : [];
    } catch {
      return [];
    }
  }

  private parseOutcome(value: unknown): LaTahriqhaChallengeResult | undefined {
    if (typeof value !== 'string') return undefined;
    try {
      return JSON.parse(value) as LaTahriqhaChallengeResult;
    } catch {
      return undefined;
    }
  }
}
