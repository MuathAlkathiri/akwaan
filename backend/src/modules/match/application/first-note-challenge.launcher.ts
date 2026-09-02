import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { StartFirstNoteGameplay } from '../../live-game-sessions/application/start-first-note-gameplay.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  FIRST_NOTE_GAMEPLAY_PLUGIN,
  FIRST_NOTE_ITEM_COUNT,
  FIRST_NOTE_MODE_KEY,
  FirstNoteSongResult,
} from '../../live-game-sessions/domain/first-note-gameplay.plugin';
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
export class FirstNoteChallengeLauncher
  implements MatchChallengeLauncher, OnModuleInit
{
  readonly key = FIRST_NOTE_MODE_KEY;
  readonly launchRequirements = {
    contentItemCount: FIRST_NOTE_ITEM_COUNT,
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
    private readonly start: StartFirstNoteGameplay,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
  ) {}
  onModuleInit() {
    this.registry.register(this);
  }
  supports(input: { challengeTypeSlug: string; runtimeKey?: string }) {
    return (
      input.runtimeKey === this.key || input.challengeTypeSlug === this.key
    );
  }
  async validateLaunch(context: MatchChallengeLaunchContext) {
    if (
      context.contentItemIds.length !== FIRST_NOTE_ITEM_COUNT ||
      new Set(context.contentItemIds).size !== FIRST_NOTE_ITEM_COUNT
    )
      throw new MatchDomainError(
        'FIRST_NOTE_REQUIRES_THREE_ITEMS',
        'First Note needs exactly three distinct songs',
      );
  }
  async launch(context: MatchChallengeLaunchContext) {
    await this.start.execute({
      sessionId: context.sessionId,
      actorId: context.actorId,
      worldId: context.worldId,
      slotKey: context.slotKey,
      contentItemIds: context.contentItemIds,
    });
    const runtime = await this.runtimes.findBySessionId(context.sessionId);
    if (!runtime)
      throw new MatchDomainError(
        'FIRST_NOTE_RUNTIME_NOT_CREATED',
        'First Note runtime was not created',
      );
    return { runtimeId: runtime.id };
  }
  presentedContentItemIds(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[] {
    const state = input.runtime.runtimeState;
    if (
      !state ||
      !input.runtime.presentationActivatedAt ||
      !FIRST_NOTE_GAMEPLAY_PLUGIN.presentedContentItemIds
    )
      return [];
    return FIRST_NOTE_GAMEPLAY_PLUGIN.presentedContentItemIds({
      runtimeState: state,
      roundState: input.runtime.activeRound?.modeState ?? {},
      orderedContentItemIds: input.orderedContentItemIds,
    });
  }
  detectTerminal(runtime: GameplayRuntimeState) {
    return runtime.runtimeState?.phase === 'completed';
  }
  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary {
    const results = this.parse<FirstNoteSongResult[]>(
      runtime.runtimeState?.resultsJson,
      [],
    );
    const teams = this.parse<string[]>(runtime.runtimeState?.teamIdsJson, []);
    const totals = Object.fromEntries(teams.map((t) => [t, 0]));
    for (const result of results)
      for (const team of teams) totals[team] += result.points[team] ?? 0;
    const [a, b] = teams;
    const winnerTeamId =
      totals[a] === totals[b] ? null : totals[a] > totals[b] ? a : b;
    return {
      challengeKey: this.key,
      winnerTeamId,
      mechanicSummary: totals,
      details: {
        itemsPlayed: results.length,
        items: results,
        mechanicTotals: totals,
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
