import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartTop5 } from '../../live-game-sessions/application/start-top5.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  TOP5_MODE_KEY,
  Top5Result,
} from '../../live-game-sessions/domain/top5-keep-or-give.plugin';
import {
  ChallengeAnswerMode,
  TOP5_VARIANT,
} from '../../world-content/domain/world-content.constants';
import { MATCH_CONTENT_CARDINALITY } from '../domain/match.constants';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

/**
 * أفضل 5, as a Match board slot.
 *
 * One continuous content item, delegated to StartTop5. The mechanic owns its
 * deck, its participant rotation, and its internal 0–5 result; this adapter only
 * binds, recognises the terminal state, and hands the Match a summary it can
 * render a reveal from.
 */
@Injectable()
export class Top5ChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = TOP5_MODE_KEY;

  /**
   * One continuous item, and phones.
   *
   * `decide-card` is authorised `active-participant`: a named player on the
   * acting team, from their own phone. The controller can only skip a stuck
   * card, so the mechanic genuinely cannot be played without phones.
   */
  readonly launchRequirements = {
    contentItemCount: MATCH_CONTENT_CARDINALITY[TOP5_MODE_KEY],
    requiresPhones: true,
    /**
     * One phone per team, no upper bound. Cards alternate between the teams, so
     * each team needs at least one connected player to hold its rotation; more
     * players simply take turns being the decision-maker.
     */
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.answerMode === ChallengeAnswerMode.TOP_5 &&
      item.mechanicVariant === TOP5_VARIANT,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startTop5: StartTop5,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === TOP5_MODE_KEY ||
      input.challengeTypeSlug === TOP5_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    const required = MATCH_CONTENT_CARDINALITY[TOP5_MODE_KEY];
    if (context.contentItemIds.length !== required) {
      throw new MatchDomainError(
        'TOP5_REQUIRES_ONE_ITEM',
        `Top 5 needs exactly ${required} content item`,
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startTop5.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      challengeTypeId: context.challengeTypeId,
      contentItemId: context.contentItemIds[0],
      ...(context.startingTeamId
        ? { startingTeamId: context.startingTeamId }
        : {}),
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'TOP5_RUNTIME_NOT_CREATED',
        'The Top 5 runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** Terminal once the tenth card has been decided. */
  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return (
      runtime.runtimeState?.phase === 'completed' ||
      runtime.activeRound?.modeState?.phase === 'completed'
    );
  }

  /**
   * Everything the result screen needs, and the reveal order among it.
   *
   * The order was minted server side when the runtime started and withheld from
   * every projection until now; it travels here so the ChallengeResult owns it
   * permanently and a refreshed reveal replays identically.
   */
  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const raw = runtime.runtimeState?.resultJson;
    let result: Partial<Top5Result> = {};
    if (typeof raw === 'string' && raw) {
      try {
        result = JSON.parse(raw) as Top5Result;
      } catch {
        result = {};
      }
    }
    return {
      challengeKey: this.key,
      winnerTeamId: result.winnerTeamId,
      // The 3-2 that decided it. Provenance on the Match point, never a score.
      ...(result.top5Counts ? { mechanicSummary: result.top5Counts } : {}),
      details: {
        title: runtime.runtimeState?.title ?? '',
        rankingBasis: runtime.runtimeState?.rankingBasis ?? '',
        sourceLabel: runtime.runtimeState?.sourceLabel ?? '',
        entries: result.entries ?? [],
        ownership: result.ownership ?? [],
        top5Counts: result.top5Counts ?? {},
        trapCounts: result.trapCounts ?? {},
        revealOrder: result.revealOrder ?? [],
        winnerTeamId: result.winnerTeamId ?? null,
      },
    };
  }
}
