import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartTop10PoisonDeck } from '../../live-game-sessions/application/start-top10-poison-deck.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  TOP10_MODE_KEY,
  TOP10_POISON_DECK_VARIANT,
} from '../../live-game-sessions/domain/top10-poison-deck.plugin';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
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
 * Top 10 Poison Deck, as a Match board slot.
 *
 * One continuous content item, delegated to StartTop10PoisonDeck. The mechanic
 * owns its deck, turns, timers, and scoring; this adapter only binds and observes.
 */
@Injectable()
export class Top10PoisonDeckChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = TOP10_MODE_KEY;

  /**
   * One continuous item, and phones.
   *
   * The deck advances on `assign-card`, which the plugin authorises as
   * `active-team-player` — a connected player on the acting team. The controller
   * can only reveal and time out; it cannot make the keep/poison decisions, so the
   * mechanic cannot be played without phones.
   */
  readonly launchRequirements = {
    contentItemCount: MATCH_CONTENT_CARDINALITY[TOP10_MODE_KEY],
    requiresPhones: true,
    /**
     * One phone per team, no upper bound.
     *
     * `assign-card` is authorised `active-team-player`, and the deck hands cards to
     * both teams in turn, so each team needs at least one connected player. The
     * controller's reveal and timeout commands cannot substitute for the decision.
     */
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.answerMode === ChallengeAnswerMode.TOP_10 &&
      item.mechanicVariant === TOP10_POISON_DECK_VARIANT,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startTop10: StartTop10PoisonDeck,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === TOP10_MODE_KEY ||
      input.challengeTypeSlug === TOP10_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    const required = MATCH_CONTENT_CARDINALITY[TOP10_MODE_KEY];
    if (context.contentItemIds.length !== required) {
      throw new MatchDomainError(
        'TOP10_REQUIRES_ONE_ITEM',
        `Top 10 Poison Deck needs exactly ${required} content item`,
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startTop10.execute({
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
        'TOP10_RUNTIME_NOT_CREATED',
        'The Top 10 Poison Deck runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** Terminal once the reveal has walked the whole deck. */
  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return (
      runtime.runtimeState?.phase === 'completed' ||
      runtime.activeRound?.modeState?.phase === 'completed'
    );
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const raw = runtime.runtimeState?.resultJson;
    let details: Record<string, unknown> = {};
    if (typeof raw === 'string' && raw) {
      try {
        details = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        details = {};
      }
    }
    return { challengeKey: this.key, details };
  }
}
