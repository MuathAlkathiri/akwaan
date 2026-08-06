import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartRyoGameplay } from '../../live-game-sessions/application/start-ryo-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { RYO_MODE_KEY } from '../../live-game-sessions/domain/ryo-gameplay.plugin';
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
 * Read Your Opponent, as a Match board slot.
 *
 * Startup is delegated wholesale to StartRyoGameplay; this adapter only reports
 * the runtime id back to the Match binding and recognises the terminal state the
 * plugin already sets after its third item.
 */
@Injectable()
export class RyoChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = RYO_MODE_KEY;

  /**
   * Three items, and both phones.
   *
   * The exchange only resolves when the answering team submits an answer and the
   * opposing team submits its steal/trust decision, each privately from its own
   * phone — the plugin refuses a submission from the wrong side and auto-resolves
   * only once both have arrived. There is no host-driven substitute.
   */
  readonly launchRequirements = {
    contentItemCount: MATCH_CONTENT_CARDINALITY[RYO_MODE_KEY],
    requiresPhones: true,
    /**
     * One phone per team is enough, and there is no upper bound.
     *
     * The plugin authorises submissions as `connected-player` and auto-resolves on
     * one answer from the answering team plus one decision from the opposing team —
     * so each team needs at least one connected player, and extra phones are
     * harmless. Deliberately *not* the two-or-three range ركّبها needs.
     */
    readiness: {
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      // Machine-checkable only: RYO never carries an open answer.
      item.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE ||
      item.answerMode === ChallengeAnswerMode.CLOSEST,
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startRyo: StartRyoGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === RYO_MODE_KEY ||
      input.challengeTypeSlug === RYO_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    const required = MATCH_CONTENT_CARDINALITY[RYO_MODE_KEY];
    if (
      context.contentItemIds.length !== required ||
      new Set(context.contentItemIds).size !== required
    ) {
      throw new MatchDomainError(
        'RYO_REQUIRES_THREE_ITEMS',
        `Read Your Opponent needs exactly ${required} distinct content items`,
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startRyo.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
      ...(context.startingTeamId
        ? { startingTeamId: context.startingTeamId }
        : {}),
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'RYO_RUNTIME_NOT_CREATED',
        'The Read Your Opponent runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** The plugin sets phase `completed` once the third item has resolved. */
  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return runtime.runtimeState?.phase === 'completed';
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const results = this.parseList(runtime.runtimeState?.resultsJson);
    return {
      challengeKey: this.key,
      details: {
        itemsPlayed: results.length,
        items: results.map((result) => ({
          correct: result.correct ?? null,
          decision: result.decision ?? null,
        })),
      },
    };
  }

  private parseList(value: unknown): Array<Record<string, unknown>> {
    if (typeof value !== 'string' || !value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? (parsed as Array<Record<string, unknown>>)
        : [];
    } catch {
      return [];
    }
  }
}
