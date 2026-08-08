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

  /**
   * Everything the recap needs to explain all three interactions.
   *
   * Each item carries who answered, what they answered, whether it was right,
   * who made the blind Trust/Steal call, and the signed payoff that moved. Those
   * payoffs are *mechanic* accounting: they decide who won the challenge and
   * they are what the recap shows, but they never reach the Match scoreboard —
   * the Match receives one point for the winner and nothing else.
   *
   * The winner is therefore still the mechanic's own conclusion (the sum of its
   * own signed events), computed here rather than by the Match or a client. A
   * genuine tie returns no winner, and a tie mints no Match point.
   */
  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const results = this.parseList(runtime.runtimeState?.resultsJson);
    const totals = new Map<string, number>();
    const items = results.map((result, index) => {
      const event = this.parseEvent(result.scoreEventJson);
      const teamId =
        typeof event?.teamId === 'string' ? event.teamId : undefined;
      const delta = typeof event?.delta === 'number' ? event.delta : 0;
      if (teamId) totals.set(teamId, (totals.get(teamId) ?? 0) + delta);
      return {
        itemIndex: Number(result.itemIndex ?? index),
        prompt: result.promptText ?? null,
        answeringTeamId: result.answeringTeamId ?? null,
        answererParticipantId: result.answererParticipantId ?? null,
        selectedAnswer: result.selectedAnswer ?? null,
        correctAnswer: result.correctAnswer ?? null,
        correct: result.correct ?? null,
        opposingTeamId: result.opposingTeamId ?? null,
        deciderParticipantId: result.deciderParticipantId ?? null,
        decision: result.decision ?? null,
        // Renamed from `points`: these are payoff swings inside the mechanic,
        // not Match points, and one name must not mean both.
        mechanicPoints: teamId ? [{ teamId, points: delta }] : [],
      };
    });
    const ranked = [...totals.entries()].sort(
      (left, right) => right[1] - left[1],
    );
    // RYO's payoff matrix can genuinely tie, unlike Top 5; a tie declares no
    // winner rather than inventing one.
    const winnerTeamId =
      ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])
        ? ranked[0][0]
        : null;
    const mechanicTotals = Object.fromEntries(totals);
    return {
      challengeKey: this.key,
      winnerTeamId,
      mechanicSummary: mechanicTotals,
      details: {
        itemsPlayed: results.length,
        items,
        /**
         * The challenge's own signed totals, e.g. `{ teamA: 2, teamB: -1 }`.
         * Persisted here because the Match ledger no longer carries them, and
         * losing them would lose the recap.
         */
        mechanicTotals,
        tie: winnerTeamId === null,
      },
    };
  }

  private parseEvent(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
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
