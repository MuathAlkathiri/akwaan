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
