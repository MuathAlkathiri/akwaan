import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartComboGameplay } from '../../live-game-sessions/application/start-combo-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  COMBO_MODE_KEY,
  ComboResult,
  ComboRunResult,
  COMBO_GAMEPLAY_PLUGIN,
} from '../../live-game-sessions/domain/combo-gameplay.plugin';
import {
  COMBO_ITEM_COUNT,
  COMBO_RUNS_PER_CHALLENGE,
  COMBO_STAGES,
} from '../../world-content/domain/combo-content.policy';
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
 * The Anime Signature, adapted to one Match board slot.
 *
 * Like every launcher this owns none of the mechanic: it delegates startup to
 * `StartComboGameplay` and afterwards only reports whether the runtime finished
 * and who the mechanic says won. Combo's banked points are reported as
 * `mechanicSummary` — provenance for the Match point, never Match score.
 */
/**
 * Combo's launch contract, exported so local rollout tooling can run the real
 * selector against the same declaration the launcher uses — a copy would let the
 * gate pass while an actual launch fails.
 */
export const COMBO_CHALLENGE_LAUNCHER_REQUIREMENTS = {
  contentItemCount: COMBO_ITEM_COUNT,
  requiresPhones: true,
  readiness: {
    minParticipantsPerTeam: 1,
    requiresBothTeams: true,
    requiresTeamAssignment: true,
    requiresConnectedPresence: true,
  },
  // Combo grades typed text, so only match-answer items are playable. The
  // stage contract itself is enforced by the content policy at launch, where a
  // precise rejection can name the offending item.
  isPlayableItem: (item: MatchSelectableContentItem) =>
    item.answerMode === ChallengeAnswerMode.MATCH,
  // Two items at each of the four stages: one per Run. Declared here so the
  // shared selector does the stratified draw rather than Combo selecting
  // content for itself.
  selectionStrata: {
    stratumOf: (item: MatchSelectableContentItem) => item.comboStage,
    strata: COMBO_STAGES,
    perStratum: COMBO_RUNS_PER_CHALLENGE,
  },
};

@Injectable()
export class ComboChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = COMBO_MODE_KEY;
  readonly launchRequirements = COMBO_CHALLENGE_LAUNCHER_REQUIREMENTS;

  constructor(
    private readonly registry: ChallengeLauncherRegistry,
    private readonly startCombo: StartComboGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean {
    return (
      input.runtimeKey === COMBO_MODE_KEY ||
      input.challengeTypeSlug === COMBO_MODE_KEY
    );
  }

  async validateLaunch(context: MatchChallengeLaunchContext): Promise<void> {
    if (
      context.contentItemIds.length !== COMBO_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== COMBO_ITEM_COUNT
    ) {
      throw new MatchDomainError(
        'COMBO_REQUIRES_EIGHT_ITEMS',
        `Combo needs exactly ${COMBO_ITEM_COUNT} distinct content items`,
      );
    }
  }

  async launch(
    context: MatchChallengeLaunchContext,
  ): Promise<{ runtimeId: string }> {
    await this.startCombo.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime) {
      throw new MatchDomainError(
        'COMBO_RUNTIME_NOT_CREATED',
        'The Combo runtime was not created',
      );
    }
    return { runtimeId: runtime.id };
  }

  /** Delegated to the mechanic, which alone knows what it has presented. */
  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    const state = input.runtime.runtimeState;
    const roundState = input.runtime.activeRound?.modeState;
    if (!state || !COMBO_GAMEPLAY_PLUGIN.presentedContentItemIds) return [];
    return COMBO_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState: state,
      roundState: roundState ?? {},
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }

  detectTerminal(runtime: GameplayRuntimeState): boolean {
    return runtime.runtimeState?.phase === 'completed';
  }

  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const result = this.parse<ComboResult>(runtime.runtimeState?.resultJson);
    const runs =
      this.parse<ComboRunResult[]>(runtime.runtimeState?.runResultsJson) ?? [];
    const points = result?.points ?? {};
    return {
      challengeKey: this.key,
      // The mechanic's own verdict, recorded verbatim. A tie stays a tie.
      winnerTeamId: result?.winnerTeamId ?? null,
      // The 4-2 that decided it. Provenance on the Match point, never a score.
      ...(Object.keys(points).length ? { mechanicSummary: points } : {}),
      details: {
        points,
        tie: result?.tie ?? false,
        runs: runs.map((run) => ({
          teamId: run.teamId,
          bankedPoints: run.bankedPoints,
          questionsAnswered: run.questionsAnswered,
          endedBy: run.endedBy,
          brokenByTeamId: run.brokenByTeamId,
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
