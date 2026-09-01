import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartOddPieceGameplay } from '../../live-game-sessions/application/start-odd-piece-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  ODD_PIECE_GAMEPLAY_PLUGIN,
  ODD_PIECE_MODE_KEY,
  OddPieceChallengeResult,
  OddPieceResult,
} from '../../live-game-sessions/domain/odd-piece-gameplay.plugin';
import { ODD_PIECE_ITEM_COUNT } from '../../world-content/domain/odd-piece-content.policy';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from '../domain/match.errors';
import {
  ChallengeLauncherRegistry,
  MatchChallengeCompletionSummary,
  MatchChallengeLaunchContext,
  MatchChallengeLauncher,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

export const ODD_PIECE_LAUNCHER_REQUIREMENTS = {
  contentItemCount: ODD_PIECE_ITEM_COUNT,
  requiresPhones: true,
  readiness: {
    minParticipantsPerTeam: 1,
    requiresBothTeams: true,
    requiresTeamAssignment: true,
    requiresConnectedPresence: true,
  },
  isPlayableItem: (item: MatchSelectableContentItem) =>
    item.answerMode === ChallengeAnswerMode.ODD_PIECE &&
    item.mechanicVariant === 'odd-piece',
};

@Injectable()
export class OddPieceChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = ODD_PIECE_MODE_KEY;
  readonly launchRequirements = ODD_PIECE_LAUNCHER_REQUIREMENTS;

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startOddPiece: StartOddPieceGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === ODD_PIECE_MODE_KEY ||
      input.challengeTypeSlug === ODD_PIECE_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== ODD_PIECE_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== ODD_PIECE_ITEM_COUNT
    )
      throw new MatchDomainError(
        'ODD_PIECE_REQUIRES_THREE_ITEMS',
        `Odd Piece needs exactly ${ODD_PIECE_ITEM_COUNT} distinct puzzles`,
      );
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startOddPiece.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime)
      throw new MatchDomainError(
        'ODD_PIECE_RUNTIME_NOT_CREATED',
        'The Odd Piece runtime was not created',
      );
    return { runtimeId: runtime.id };
  }

  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    if (
      !input.runtime.presentationActivatedAt ||
      !ODD_PIECE_GAMEPLAY_PLUGIN.presentedContentItemIds
    )
      return [];
    return ODD_PIECE_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState: input.runtime.runtimeState,
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
    const result = this.parse<OddPieceChallengeResult>(
      runtime.runtimeState?.resultJson,
    ) ?? { winnerTeamId: null, tie: true, points: {} };
    const puzzles =
      this.parse<OddPieceResult[]>(runtime.runtimeState?.resultsJson) ?? [];
    return {
      challengeKey: this.key,
      winnerTeamId: result.winnerTeamId,
      mechanicSummary: result.points,
      details: {
        points: result.points,
        tie: result.tie,
        puzzles: puzzles.map((puzzle) => ({
          puzzleIndex: puzzle.puzzleIndex,
          winnerTeamId: puzzle.winnerTeamId,
          attempts: puzzle.attempts.length,
        })),
      },
    };
  }

  private parse<T>(value: unknown): T | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
}
