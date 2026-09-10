import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartEkshifniGameplay } from '../../live-game-sessions/application/start-ekshifni-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  EKSHIFNI_GAMEPLAY_PLUGIN,
  EKSHIFNI_ITEM_COUNT,
  EKSHIFNI_MODE_KEY,
  EkshifniImageResult,
} from '../../live-game-sessions/domain/ekshifni-gameplay.plugin';
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
export class EkshifniChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = EKSHIFNI_MODE_KEY;
  readonly launchRequirements = {
    contentItemCount: EKSHIFNI_ITEM_COUNT,
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
    private readonly start: StartEkshifniGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === EKSHIFNI_MODE_KEY ||
      input.challengeTypeSlug === EKSHIFNI_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== EKSHIFNI_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== EKSHIFNI_ITEM_COUNT
    ) {
      throw new MatchDomainError(
        'EKSHIFNI_REQUIRES_THREE_ITEMS',
        'اكشفني needs exactly three distinct celebrities',
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
      // The selecting team opens images 1 and 3; its opponent opens image 2.
      ...(context.startingTeamId
        ? { startingTeamId: context.startingTeamId }
        : {}),
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'EKSHIFNI_RUNTIME_NOT_CREATED',
        'The اكشفني runtime was not created',
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
    if (!runtimeState || !EKSHIFNI_GAMEPLAY_PLUGIN.presentedContentItemIds)
      return [];
    // Fair-start: selection is not exposure. Until gameplay is activated the
    // first celebrity has been shown to nobody, so an abort before activation
    // returns it unspent. Keyed off the plugin's own opt-in, not a slug check.
    if (
      EKSHIFNI_GAMEPLAY_PLUGIN.deadline?.source === 'runtime-state' &&
      EKSHIFNI_GAMEPLAY_PLUGIN.deadline.requiresPresentationActivation &&
      !input.runtime.presentationActivatedAt
    ) {
      return [];
    }
    return EKSHIFNI_GAMEPLAY_PLUGIN.presentedContentItemIds({
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
    const results = this.parse<EkshifniImageResult[]>(
      runtime.runtimeState?.resultsJson,
      [],
    );
    const teamIds = this.parse<string[]>(runtime.runtimeState?.teamIdsJson, []);
    // The internal 5→1 per-image values accumulate into team totals; the higher
    // total wins the challenge. The Match scoreboard still moves by exactly one
    // CHALLENGE_WIN point — the 5→1 margin only decides the winner.
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
