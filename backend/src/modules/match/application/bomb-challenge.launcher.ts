import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartBombGameplayFromContent } from '../../live-game-sessions/application/start-bomb-from-content.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import {
  GameplayRuntimeState,
  isTerminalRuntimeStatus,
} from '../../live-game-sessions/domain/gameplay-runtime';
import { BOMB_MODE_KEY } from '../../live-game-sessions/domain/bomb-gameplay.plugin';
import {
  BOMB_MAX_ITEMS,
  BOMB_MIN_ITEMS,
} from '../../world-content/domain/bomb-content.policy';
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
 * "القنبلة" as a board Challenge.
 *
 * Bomb decides its own winner — most clock left, or the other team when a clock
 * runs out — and writes that verdict onto the runtime when it completes. This
 * launcher only reads it back, so the mechanic's rules stay inside the mechanic
 * and the Match applies its single canonical rule: the winner takes a point, a
 * tie takes none.
 */
@Injectable()
export class BombChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = BOMB_MODE_KEY;
  readonly launchRequirements = {
    // Bomb is the one mechanic with a range rather than a fixed count: a run is
    // 10–15 pictures. The registry takes the minimum as the selection floor and
    // `validateLaunch` enforces the ceiling.
    contentItemCount: BOMB_MIN_ITEMS,
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
    private readonly startBomb: StartBombGameplayFromContent,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === BOMB_MODE_KEY ||
      input.challengeTypeSlug === BOMB_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    const count = context.contentItemIds.length;
    if (count < BOMB_MIN_ITEMS || count > BOMB_MAX_ITEMS) {
      throw new MatchDomainError(
        'BOMB_REQUIRES_TEN_TO_FIFTEEN_ITEMS',
        `Bomb needs ${BOMB_MIN_ITEMS}–${BOMB_MAX_ITEMS} ordered items, received ${count}`,
      );
    }
    if (new Set(context.contentItemIds).size !== count) {
      throw new MatchDomainError(
        'BOMB_ITEMS_NOT_DISTINCT',
        'A Bomb challenge cannot play the same item twice',
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    // The selection array is passed through untouched: its order is the order
    // the pictures appear in.
    await this.startBomb.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'BOMB_RUNTIME_NOT_CREATED',
        'The Bomb runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /**
   * Bomb's runtime phase stays `ready` for the whole challenge — the round
   * carries the phase — so terminality comes from the runtime status the
   * completion step sets, not from a mode field.
   */
  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return isTerminalRuntimeStatus(runtime.status);
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const verdict = this.parseVerdict(runtime.runtimeState?.resultJson);
    const winnerTeamId = verdict?.winnerTeamId ?? null;
    return {
      challengeKey: this.key,
      // `null` is a genuine tie — equal clocks after every item — and the Match
      // scores it as zero rather than picking a side.
      winnerTeamId,
      mechanicSummary: winnerTeamId ? { [winnerTeamId]: 1 } : {},
      details: {
        endedBy: verdict?.endedBy ?? 'unknown',
        tie: winnerTeamId === null,
      },
    };
  }

  private parseVerdict(
    value: unknown,
  ): { winnerTeamId: string | null; endedBy: string } | undefined {
    if (typeof value !== 'string') return undefined;
    try {
      const parsed = JSON.parse(value) as {
        winnerTeamId?: unknown;
        endedBy?: unknown;
      };
      return {
        winnerTeamId:
          typeof parsed.winnerTeamId === 'string' && parsed.winnerTeamId
            ? parsed.winnerTeamId
            : null,
        endedBy:
          typeof parsed.endedBy === 'string' ? parsed.endedBy : 'unknown',
      };
    } catch {
      return undefined;
    }
  }
}
