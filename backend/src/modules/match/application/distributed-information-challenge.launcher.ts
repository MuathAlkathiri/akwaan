import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartDistributedInformation } from '../../live-game-sessions/application/start-distributed-information.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  DISTRIBUTED_INFORMATION_MODE_KEY,
  DistributedResult,
  DISTRIBUTED_INFORMATION_PLUGIN,
} from '../../live-game-sessions/domain/distributed-information.plugin';
import {
  DISTRIBUTED_INFORMATION_ANSWER_MODES,
  DISTRIBUTED_INFORMATION_ITEM_COUNT,
  DISTRIBUTED_INFORMATION_VARIANT,
} from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

const REQUIRED_ITEMS = DISTRIBUTED_INFORMATION_ITEM_COUNT;

/**
 * "ركّبها", as a Match board slot.
 *
 * Both teams race the same three ContentItems simultaneously, so there is no
 * starting team to rotate. Startup is delegated wholesale to
 * StartDistributedInformation; this adapter only binds the runtime and reads the
 * safe aggregate result back out.
 */
@Injectable()
export class DistributedInformationChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = DISTRIBUTED_INFORMATION_MODE_KEY;

  /**
   * Three items, and phones on both teams.
   *
   * The mechanic exists because no single player can answer alone: each puzzle is
   * split across two or three connected phones per team. Startup itself refuses a
   * team outside that range, so this is a hard requirement, not a preference.
   */
  readonly launchRequirements = {
    contentItemCount: DISTRIBUTED_INFORMATION_ITEM_COUNT,
    requiresPhones: true,
    // Exactly the range StartDistributedInformation.eligibleTeams enforces: two or
    // three connected team-players on each of the two teams.
    readiness: {
      minParticipantsPerTeam: 2,
      maxParticipantsPerTeam: 3,
      requiresBothTeams: true,
      requiresTeamAssignment: true,
      requiresConnectedPresence: true,
    },
    isPlayableItem: (item: MatchSelectableContentItem) =>
      item.mechanicVariant === DISTRIBUTED_INFORMATION_VARIANT &&
      // Fragmenting authored content is only safe where the author said so.
      item.authorSafetyConfirmation === true &&
      DISTRIBUTED_INFORMATION_ANSWER_MODES.includes(
        item.answerMode as (typeof DISTRIBUTED_INFORMATION_ANSWER_MODES)[number],
      ),
  };

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startChallenge: StartDistributedInformation,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === DISTRIBUTED_INFORMATION_MODE_KEY ||
      input.challengeTypeSlug === DISTRIBUTED_INFORMATION_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== REQUIRED_ITEMS ||
      new Set(context.contentItemIds).size !== REQUIRED_ITEMS
    ) {
      throw new MatchDomainError(
        'DISTRIBUTED_REQUIRES_THREE_ITEMS',
        `ركّبها needs exactly ${REQUIRED_ITEMS} distinct content items`,
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    // Team sizes and content eligibility are asserted by the use case, which is
    // the same code path the development launcher uses.
    await this.startChallenge.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'DISTRIBUTED_RUNTIME_NOT_CREATED',
        'The ركّبها runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** Terminal once the race resolved, by a finish or by the deadline. */
  /** Delegated to the mechanic, which alone knows what it has presented. */
  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    const runtimeState = input.runtime.runtimeState;
    if (
      !runtimeState ||
      !DISTRIBUTED_INFORMATION_PLUGIN.presentedContentItemIds
    )
      return [];
    return DISTRIBUTED_INFORMATION_PLUGIN.presentedContentItemIds({
      runtimeState,
      roundState: input.runtime.activeRound?.modeState ?? {},
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return runtime.runtimeState?.phase === 'completed';
  }

  /**
   * Aggregates only. No segment text, no answers, and no per-participant plan
   * ever reaches a Match summary.
   */
  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const raw = runtime.runtimeState?.resultJson;
    if (typeof raw !== 'string' || !raw) {
      return { challengeKey: this.key, details: {} };
    }
    let result: DistributedResult | undefined;
    try {
      result = JSON.parse(raw) as DistributedResult;
    } catch {
      return { challengeKey: this.key, details: {} };
    }
    return {
      challengeKey: this.key,
      // Declared upward so the Match can award its single point. The race
      // already decided this; it was only ever reported inside `details`.
      winnerTeamId: result.tie ? null : (result.winnerTeamId ?? null),
      mechanicSummary: {
        solved: result.solved,
        elapsedMsAtLastProgress: result.elapsedMsAtLastProgress,
      },
      details: {
        winnerTeamId: result.winnerTeamId,
        tie: result.tie,
        completionReason: result.reason,
        solved: result.solved,
        wrongAttempts: result.wrongAttempts,
        elapsedMsAtLastProgress: result.elapsedMsAtLastProgress,
      },
    };
  }
}
