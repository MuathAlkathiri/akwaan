import { Injectable } from '@nestjs/common';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MatchChallengeReadinessRequirement } from '../domain/match-challenge-readiness';
import { MatchDomainError } from '../domain/match.errors';

export type { MatchChallengeReadinessRequirement };

/**
 * One ContentItem, as the Match's content selection sees it.
 *
 * Narrow on purpose: a launcher declares which items its runtime will accept
 * without reaching into a persistence document, and the selector cannot pick an
 * item the runtime would then reject.
 */
export interface MatchSelectableContentItem {
  id: string;
  worldId: string;
  scopeId: string;
  answerMode: string;
  /** `mechanicPayload.variant`, when the mechanic authored one. */
  mechanicVariant?: string;
  /** `mechanicPayload.authorSafetyConfirmation`, when the mechanic requires it. */
  authorSafetyConfirmation?: boolean;
  /** `mechanicPayload.comboStage`, when the mechanic authored a Combo stage. */
  comboStage?: number;
  /** "المرحلة" risk band, from `mechanicPayload.marhalaDifficulty`. */
  marhalaDifficulty?: string;
}

/**
 * What one mechanic needs before it can be launched.
 *
 * The launcher is the single source of truth for this. Nothing downstream — no
 * controller, no frontend, no switch statement over slugs — restates how many
 * items a mechanic plays, which items it can play, or whether it can resolve
 * without the players' phones.
 */
export interface MatchChallengeLaunchRequirements {
  /** Exactly this many distinct ContentItems, chosen by the server. */
  contentItemCount: number;
  /**
   * True when the mechanic cannot resolve without private input from connected
   * player phones. Every currently implemented mechanic is phone-required.
   */
  requiresPhones: boolean;
  /**
   * The phone conditions the runtime needs. Present exactly when
   * `requiresPhones` is true, and authoritative: a launch re-checks it server side.
   */
  readiness?: MatchChallengeReadinessRequirement;
  /**
   * Stratified selection, for a mechanic whose items are not interchangeable.
   *
   * Most mechanics draw N items and treat them as equivalent, so the Scope
   * spread is the only balancing rule needed. "الكومبو" cannot: its Run rises
   * through four authored stages and it needs exactly two items at each, one per
   * team. Declaring the strata here keeps that in the one component that owns
   * content selection instead of giving the mechanic a private draw.
   *
   * The Scope spread still applies *within* each stratum.
   */
  selectionStrata?: {
    /** Which stratum an item belongs to, or undefined if none. */
    stratumOf(item: MatchSelectableContentItem): string | number | undefined;
    /** Every stratum that must be satisfied. */
    strata: ReadonlyArray<string | number>;
    /** How many items to draw from each stratum. */
    perStratum: number;
  };

  /**
   * Eligibility beyond "ready, in this World, in this occurrence's Scopes, and
   * compatible with this mechanic" — the mechanic's own payload contract.
   */
  isPlayableItem?(item: MatchSelectableContentItem): boolean;
}

/** What a launcher needs in order to start a mechanic for one board slot. */
export interface MatchChallengeLaunchContext {
  sessionId: string;
  actorId: string;
  matchId: string;
  occurrenceIndex: number;
  worldId: string;
  slotKey: WorldChallengeSlotKey;
  challengeTypeId: string;
  challengeTypeSlug: string;
  contentItemIds: string[];
  startingTeamId?: string;
}

export interface MatchChallengeCompletionSummary {
  challengeKey: string;
  /**
   * Who the mechanic says won. The Match records this verbatim and never
   * derives it — a winner is the mechanic's own conclusion, and a frontend must
   * never be in a position to compute a different one.
   */
  winnerTeamId?: string | null;
  /**
   * The mechanic's own margin, e.g. `{ 'team-a': 3, 'team-b': 2 }`. Carried onto
   * the Match point as provenance — it explains why this team won — and never
   * summed into the Match scoreboard.
   */
  mechanicSummary?: Record<string, unknown>;
  /** Mechanic-shaped, client-safe facts for the Match result card. */
  details: Record<string, unknown>;
}

/**
 * Adapter between one Match board slot and one existing mechanic runtime.
 *
 * A launcher owns none of the mechanic: it delegates startup to the mechanic's
 * existing use case and only reports back the runtime id, whether that runtime has
 * finished, and a summary. Content validation, runtime creation, team rotation,
 * timers, scoring, and plugin state all stay where they already live.
 */
export interface MatchChallengeLauncher {
  readonly key: string;
  /** How much content this mechanic plays, and whether it needs phones. */
  readonly launchRequirements: MatchChallengeLaunchRequirements;
  supports(input: { challengeTypeSlug: string; runtimeKey?: string }): boolean;
  /** Cardinality and any launcher-specific preconditions. */
  validateLaunch(context: MatchChallengeLaunchContext): Promise<void>;
  launch(context: MatchChallengeLaunchContext): Promise<{ runtimeId: string }>;
  detectTerminal(runtime: GameplayRuntimeState): boolean;
  /**
   * Which of this challenge's content items a player has actually been shown.
   *
   * Optional and additive: a launcher that does not answer never spends content,
   * which is the safe default. It delegates to its own plugin — the mechanic is
   * the only thing that knows the difference between a plan and a presentation,
   * and **selection is not exposure**. A Combo run that ends at Q2 leaves six
   * planned questions unseen; a Bomb clock that expires at item 7 leaves the rest
   * unseen. Only what was reached may be burned.
   *
   * `orderedContentItemIds` is the Match's own ordered binding, for mechanics
   * whose runtime deliberately carries no content ids and answers by position.
   */
  presentedContentItemIds?(input: {
    runtime: GameplayRuntimeState;
    orderedContentItemIds: readonly string[];
  }): string[];
  buildCompletionSummary(
    runtime: GameplayRuntimeState,
  ): MatchChallengeCompletionSummary;
}

/**
 * The Match-level registry of playable mechanics.
 *
 * Only mechanics with a registered launcher are launchable. Nothing is ever
 * auto-completed or skipped: an unregistered mechanic is reported as
 * `configured_but_unimplemented` and refuses to launch.
 */
@Injectable()
export class ChallengeLauncherRegistry {
  private readonly launchers = new Map<string, MatchChallengeLauncher>();

  register(launcher: MatchChallengeLauncher): void {
    if (this.launchers.has(launcher.key)) {
      throw new MatchDomainError(
        'CHALLENGE_LAUNCHER_ALREADY_REGISTERED',
        `A launcher is already registered for "${launcher.key}"`,
      );
    }
    this.launchers.set(launcher.key, launcher);
  }

  keys(): string[] {
    return [...this.launchers.keys()];
  }

  /** The launcher that supports a configured mechanic, if one exists. */
  find(input: {
    challengeTypeSlug: string;
    runtimeKey?: string;
  }): MatchChallengeLauncher | undefined {
    return [...this.launchers.values()].find((launcher) =>
      launcher.supports(input),
    );
  }

  byKey(key: string): MatchChallengeLauncher | undefined {
    return this.launchers.get(key);
  }

  require(input: {
    challengeTypeSlug: string;
    runtimeKey?: string;
  }): MatchChallengeLauncher {
    const launcher = this.find(input);
    if (!launcher) {
      throw new MatchDomainError(
        'CHALLENGE_NOT_LAUNCHABLE',
        `No launcher is registered for the "${input.challengeTypeSlug}" mechanic`,
      );
    }
    return launcher;
  }
}
