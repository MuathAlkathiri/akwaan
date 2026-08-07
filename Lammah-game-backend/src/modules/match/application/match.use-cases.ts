import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ConfiguredWorldOccurrence } from '../domain/configured-world-occurrence';
import { Match, MatchCoinToss, MatchTeam } from '../domain/match';
import {
  MatchSlotLaunchability,
  MatchStage,
  MatchStatus,
} from '../domain/match.constants';
import {
  MatchDomainError,
  MatchForbiddenError,
  MatchNotFoundError,
} from '../domain/match.errors';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import {
  CreateSessionJoinAccess,
  GetSessionJoinAccess,
} from '../../live-game-sessions/application/live-session-join-access.use-cases';
import {
  ChallengeLauncherRegistry,
  MatchChallengeLauncher,
  MatchChallengeReadinessRequirement,
} from './challenge-launcher.registry';
import { MatchChallengeReadinessService } from './match-challenge-readiness.service';
import { MATCH_CLOCK, MatchClock } from './match-clock';
import { MatchContentSelector } from './match-content-selection.service';
import { MatchContentPool } from './match-content-pool.service';
import {
  MatchTransitionNotifier,
  MatchTransitionReason,
} from './match-transition.notifier';
import { MatchWorldCatalog } from './match-world.catalog';
import { UnifiedMatchSetupValidator } from './unified-match-setup.validator';

interface MatchCommand {
  sessionId: string;
  actorId: string;
  commandId: string;
  expectedMatchRevision: number;
}

/**
 * Every Match command in one place, because they all share the same three
 * guards — the caller is the session controller, the command has not already been
 * applied, and the client is acting on the revision it last saw.
 */
@Injectable()
export class MatchUseCases {
  private readonly logger = new Logger(MatchUseCases.name);

  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(MATCH_CLOCK) private readonly clock: MatchClock,
    private readonly worlds: MatchWorldCatalog,
    private readonly launchers: ChallengeLauncherRegistry,
    private readonly transitions: MatchTransitionNotifier,
    private readonly contentPool: MatchContentPool,
    private readonly unifiedSetup: UnifiedMatchSetupValidator,
    private readonly contentSelector: MatchContentSelector,
    private readonly readiness: MatchChallengeReadinessService,
    private readonly joinAccess: GetSessionJoinAccess,
    private readonly createJoinAccess: CreateSessionJoinAccess,
  ) {}

  /**
   * Creates a fully configured Match in one write.
   *
   * Every decision is made and validated before anything is persisted: the live
   * session and its controller, the two teams, all three World occurrences with
   * their four Scopes each, the mechanic in each of the twelve board positions,
   * and the coin toss that decides who selects first. Only then is a single
   * document inserted, so a configuration that fails to validate leaves no Match
   * behind at all — there is no partial state to clean up and nothing to roll
   * back, which is why this needs no transaction.
   *
   * The coin toss is server-owned. No client may supply the starting team.
   */
  async createUnified(input: {
    sessionId: string;
    actorId: string;
    occurrences: ConfiguredWorldOccurrence[];
  }): Promise<Match> {
    const session = await this.requireControlledSession(
      input.sessionId,
      input.actorId,
    );
    const existing = await this.matches.findActiveBySessionId(input.sessionId);
    if (existing) {
      // Never silently discard a configuration by returning someone else's Match.
      throw new MatchDomainError(
        'MATCH_ALREADY_IN_PROGRESS',
        'This live session already has a match in progress',
      );
    }
    const teams = this.playingTeams(session);
    const setup = await this.unifiedSetup.validate(input.occurrences);
    const now = this.clock.now();
    const match = Match.createUnified({
      liveSessionId: input.sessionId,
      teams,
      occurrences: setup.occurrences,
      boardPositions: setup.boardPositions,
      coinToss: this.tossCoin(teams, now),
      now,
    });
    await this.matches.create(match);
    this.transitions.publish(match, 'created');
    this.logger.log({
      event: 'match_created',
      matchId: match.id,
      sessionId: input.sessionId,
      setupMode: match.setupMode,
      occurrenceWorldIds: setup.occurrences.map(
        (occurrence) => occurrence.worldId,
      ),
      boardPositionCount: setup.boardPositions.length,
      selectingTeamId: match.selectingTeamId,
    });
    return match;
  }

  /**
   * Chooses a board position and shows the host what it needs before it starts.
   *
   * Nothing is started here. For a phone-required mechanic that is the entire
   * point: the runtime used to be created the moment a tile was clicked, and would
   * then fail because the players were not in the room. Now the position is held,
   * join access is made available, and the mechanic's own readiness contract is
   * reported until it is satisfied.
   *
   * Content is *not* drawn during prepare — see `launchUnifiedChallenge`. A
   * cancelled preflight must not have reserved anything.
   */
  async prepareUnifiedChallenge(
    command: MatchCommand & {
      occurrenceIndex: number;
      slotKey: WorldChallengeSlotKey;
      selectingTeamId?: string;
    },
  ): Promise<Match> {
    const match = await this.load(command);
    match.assertRevision(command.expectedMatchRevision);
    if (match.isDuplicate(command.commandId)) return match;
    const occurrence = this.requireLaunchOccurrence(
      match,
      command.occurrenceIndex,
    );
    const slot = await this.launchableSlot(match, occurrence, command.slotKey);
    const launcher = this.launchers.require({
      challengeTypeSlug: slot.challengeTypeSlug,
    });
    const requirements = launcher.launchRequirements;
    // Only a mechanic that needs phones needs a join code; asking for one otherwise
    // would put a QR on screen for no reason.
    const joinCode = requirements.requiresPhones
      ? await this.ensureJoinCode(command.sessionId, command.actorId)
      : undefined;
    const revision = match.revision;
    match.prepareChallenge({
      commandId: command.commandId,
      now: this.clock.now(),
      occurrenceIndex: occurrence.index,
      slotKey: command.slotKey,
      challengeTypeId: slot.challengeTypeId,
      challengeTypeSlug: slot.challengeTypeSlug,
      requiresPhones: requirements.requiresPhones,
      ...(requirements.readiness ? { readiness: requirements.readiness } : {}),
      ...(joinCode ? { joinCode } : {}),
      ...(command.selectingTeamId
        ? { selectingTeamId: command.selectingTeamId }
        : {}),
    });
    await this.matches.save(match, revision);
    this.transitions.publish(match, 'challenge-prepared');
    this.logger.log({
      event: 'match_challenge_prepared',
      matchId: match.id,
      sessionId: command.sessionId,
      occurrenceIndex: occurrence.index,
      slotKey: command.slotKey,
      challengeKey: launcher.key,
      requiresPhones: requirements.requiresPhones,
    });
    return match;
  }

  /**
   * The authoritative readiness check.
   *
   * Runs immediately before a runtime is created, so a launch cannot succeed on a
   * readiness that was true a minute ago. The requirement itself always comes from
   * the mechanic's launcher.
   */
  private async assertChallengeReadiness(input: {
    sessionId: string;
    requirement?: MatchChallengeReadinessRequirement;
  }): Promise<void> {
    if (!input.requirement) return;
    const session = await this.sessions.findById(input.sessionId);
    if (!session) throw new MatchNotFoundError();
    const readiness = this.readiness.evaluate({
      session: session.serialize(),
      requirement: input.requirement,
    });
    if (readiness.allTeamsReady) return;
    throw new MatchDomainError(
      'MATCH_CHALLENGE_NOT_READY',
      readiness.blockingReasons
        .map((blocker) =>
          blocker.teamName
            ? `${blocker.teamName}: ${blocker.connectedCount} connected, ${blocker.required} required`
            : blocker.code,
        )
        .join('; ') || 'The players this challenge needs are not connected',
    );
  }

  /**
   * Leaves the challenge result and returns the Match to its board — or ends it.
   *
   * The only transition out of `challenge_result`. It awards nothing: every point
   * was imported when the result was recorded, so a double press, a replayed
   * command, or a reconnect that resends it cannot move a score. A press from
   * any other stage is refused rather than silently ignored.
   */
  continueFromChallengeResult(command: MatchCommand): Promise<Match> {
    return this.mutate(
      command,
      (match) => this.transitions.continueReason(match),
      (match, now) => {
        match.continueFromChallengeResult({
          commandId: command.commandId,
          now,
        });
      },
    );
  }

  /** Abandons a prepared position. Consumes nothing and changes no turn. */
  cancelUnifiedPreflight(command: MatchCommand): Promise<Match> {
    return this.mutate(command, 'preflight-cancelled', (match, now) =>
      match.cancelPreflight({ commandId: command.commandId, now }),
    );
  }

  /**
   * Reuses the session's current join access, creating one only if there is none.
   *
   * A phone that already scanned stays paired for the whole Match, so a second
   * phone-required challenge must not rotate the code out from under it.
   */
  private async ensureJoinCode(
    sessionId: string,
    actorId: string,
  ): Promise<string> {
    const current = await this.joinAccess.execute(sessionId, actorId);
    if (current?.enabled) return current.joinCode;
    const created = await this.createJoinAccess.execute({
      sessionId,
      actorId,
      // Players pick their own team on the phone, which is the existing contract
      // for a two-team session.
      assignmentPolicy: 'explicit',
    });
    return created.joinCode;
  }

  /**
   * Starts the mechanic in one board position, with the server choosing the
   * content.
   *
   * The caller names a *position* — `occurrenceIndex + slotKey` — and nothing else.
   * No ContentItem id is accepted: which items get played is a server decision,
   * drawn from that occurrence's own four Scopes, and the ids never reach a
   * client. A unified Match accepts any available position of any of its three
   * occurrences, in any order.
   */
  launchUnifiedChallenge(
    command: MatchCommand & {
      occurrenceIndex: number;
      slotKey: WorldChallengeSlotKey;
      selectingTeamId?: string;
    },
  ): Promise<Match> {
    return this.performLaunch(command, async (context) => {
      const launcher = this.launchers.require({
        challengeTypeSlug: context.slot.challengeTypeSlug,
      });
      // A phone-required mechanic is launched from its preflight, and the phones
      // are counted again here: the client's readiness view is informational, and
      // players can leave the room between seeing it and pressing the button.
      if (launcher.launchRequirements.requiresPhones) {
        const pending = context.match.requirePendingChallenge({
          occurrenceIndex: context.occurrence.index,
          slotKey: command.slotKey,
        });
        await this.assertChallengeReadiness({
          sessionId: command.sessionId,
          requirement:
            launcher.launchRequirements.readiness ?? pending.readiness,
        });
      }
      // Deterministic in the Match and the position, so a retry that gets this
      // far draws exactly the set the first attempt drew.
      return this.contentSelector.select({
        matchId: context.match.id,
        occurrenceIndex: context.occurrence.index,
        worldId: context.occurrence.worldId,
        selectedScopeIds: context.match.selectedScopeIds(
          context.occurrence.index,
        ),
        slotKey: command.slotKey,
        challengeTypeId: context.slot.challengeTypeId,
        requirements: launcher.launchRequirements,
        usedContentItemIds: context.match.usedContentItemIds(
          context.occurrence.index,
        ),
      });
    });
  }

  /**
   * Starts the mechanic in one board position from explicitly named content.
   *
   * The content is still validated against this occurrence's own pool before
   * anything is launched. The server-owned counterpart is
   * {@link MatchUseCases.launchUnifiedChallenge}, which draws the content itself.
   */
  async launchChallenge(
    command: MatchCommand & {
      slotKey: WorldChallengeSlotKey;
      occurrenceIndex: number;
      contentItemIds: string[];
      startingTeamId?: string;
      selectingTeamId?: string;
    },
  ): Promise<Match> {
    return this.performLaunch(command, async ({ occurrence, slot, match }) => {
      // Explicit selection is still validated against the pool of this
      // occurrence — a repeated World never reaches its twin's Scopes.
      await this.contentPool.assertPlayableItems({
        occurrenceIndex: occurrence.index,
        worldId: occurrence.worldId,
        contentItemIds: command.contentItemIds,
        selectedScopeIds: match.selectedScopeIds(occurrence.index),
        challengeTypeId: slot.challengeTypeId,
        usedContentItemIds: match.usedContentItemIds(occurrence.index),
      });
      return command.contentItemIds;
    });
  }

  /**
   * The one launch sequence, shared by server-owned and client-supplied content.
   *
   * Order matters and is deliberate: everything is validated, then the content is
   * resolved, then the runtime is created, and only then is the binding written.
   * A failure anywhere before the save leaves the Match on its board with the
   * position still available — a failed launch can never strand a Match in the
   * challenge stage, and never half-consumes a position.
   */
  private async performLaunch(
    command: MatchCommand & {
      slotKey: WorldChallengeSlotKey;
      occurrenceIndex: number;
      startingTeamId?: string;
      selectingTeamId?: string;
    },
    resolveContent: (context: {
      match: Match;
      occurrence: { index: number; worldId: string };
      slot: { challengeTypeId: string; challengeTypeSlug: string };
    }) => Promise<string[]>,
  ): Promise<Match> {
    const match = await this.load(command);
    match.assertRevision(command.expectedMatchRevision);
    if (match.isDuplicate(command.commandId)) return match;
    // A launch comes from the board, or from the preflight that has just gathered
    // the phones the mechanic needs.
    if (
      match.stage !== MatchStage.BOARD &&
      match.stage !== MatchStage.PREFLIGHT
    ) {
      throw new MatchDomainError(
        'MATCH_STAGE_INVALID',
        `Challenges are launched from the board, not from ${match.stage}`,
      );
    }
    const occurrence = this.requireLaunchOccurrence(
      match,
      command.occurrenceIndex,
    );
    if (!match.hasCompleteScopeSelection(occurrence.index)) {
      throw new MatchDomainError(
        'SCOPE_SELECTION_INCOMPLETE',
        "Choose this World occurrence's four Scopes before starting a challenge",
      );
    }
    const slot = await this.launchableSlot(match, occurrence, command.slotKey);
    // The aggregate re-checks every one of these before it mutates; asserting the
    // position is free and available here only avoids starting a runtime that the
    // aggregate would then refuse to bind.
    match.assertPositionLaunchable({
      occurrenceIndex: occurrence.index,
      slotKey: command.slotKey,
      ...(command.selectingTeamId
        ? { selectingTeamId: command.selectingTeamId }
        : {}),
    });
    const launcher: MatchChallengeLauncher = this.launchers.require({
      challengeTypeSlug: slot.challengeTypeSlug,
    });
    const contentItemIds = await resolveContent({ match, occurrence, slot });
    const context = {
      sessionId: command.sessionId,
      actorId: command.actorId,
      matchId: match.id,
      occurrenceIndex: occurrence.index,
      worldId: occurrence.worldId,
      slotKey: command.slotKey,
      challengeTypeId: slot.challengeTypeId,
      challengeTypeSlug: slot.challengeTypeSlug,
      contentItemIds,
      ...(command.startingTeamId
        ? { startingTeamId: command.startingTeamId }
        : {}),
    };
    await launcher.validateLaunch(context);
    const { runtimeId } = await launcher.launch(context);
    const revision = match.revision;
    match.launchChallenge({
      commandId: command.commandId,
      now: this.clock.now(),
      occurrenceIndex: occurrence.index,
      slotKey: command.slotKey,
      challengeKey: launcher.key,
      runtimeId,
      contentItemIds,
      launchability: MatchSlotLaunchability.LAUNCHABLE,
      ...(command.selectingTeamId
        ? { selectingTeamId: command.selectingTeamId }
        : {}),
    });
    await this.matches.save(match, revision);
    this.transitions.publish(match, 'challenge-launched');
    this.logger.log({
      event: 'match_challenge_launched',
      matchId: match.id,
      sessionId: command.sessionId,
      occurrenceIndex: occurrence.index,
      slotKey: command.slotKey,
      challengeKey: launcher.key,
      runtimeId,
      // The ids are logged, never published: a client must not learn what is
      // coming, but an operator has to be able to trace what was played.
      contentItemCount: contentItemIds.length,
    });
    return match;
  }

  cancel(command: MatchCommand): Promise<Match> {
    return this.mutate(command, 'cancelled', (match, now) =>
      match.cancel({ commandId: command.commandId, now }),
    );
  }

  async get(input: { sessionId: string; actorId: string }): Promise<Match> {
    await this.requireControlledSession(input.sessionId, input.actorId);
    const match = await this.matches.findLatestBySessionId(input.sessionId);
    if (!match) throw new MatchNotFoundError();
    return match;
  }

  /**
   * The occurrence a launch targets: any of the three, named explicitly. No
   * sequence is consulted — a unified Match does not have a current occurrence.
   */
  private requireLaunchOccurrence(match: Match, occurrenceIndex: number) {
    const occurrence = match.occurrences.find(
      (candidate) => candidate.index === occurrenceIndex,
    );
    if (!occurrence) {
      throw new MatchDomainError(
        'MATCH_OCCURRENCE_NOT_FOUND',
        `This match has no World occurrence ${occurrenceIndex}`,
      );
    }
    return occurrence;
  }

  /**
   * The mechanic in one board position, and a refusal if it cannot be played.
   *
   * The board the Match persisted at creation is authoritative, so a World edited
   * mid-match cannot change what is already on the table.
   */
  private async launchableSlot(
    match: Match,
    occurrence: { index: number; worldId: string },
    slotKey: WorldChallengeSlotKey,
  ): Promise<{ challengeTypeId: string; challengeTypeSlug: string }> {
    const configured = match
      .unifiedBoard()
      .find(
        (position) =>
          position.occurrenceIndex === occurrence.index &&
          position.slotKey === slotKey,
      );
    const launchability = this.worlds.launchabilityFor(configured);
    if (!configured) {
      throw new MatchDomainError(
        'BOARD_SLOT_NOT_SCHEDULED',
        `The ${slotKey} position is not part of World occurrence ${occurrence.index}`,
      );
    }
    if (launchability !== MatchSlotLaunchability.LAUNCHABLE) {
      throw new MatchDomainError(
        'CHALLENGE_NOT_LAUNCHABLE',
        `The mechanic in the ${slotKey} position is ${launchability}`,
      );
    }
    return configured;
  }

  /** The two teams a Match is played by, taken from the live session itself. */
  private playingTeams(session: {
    serialize(): {
      status: string;
      teams: Array<{ id: string; name: string; active: boolean }>;
    };
  }): MatchTeam[] {
    const state = session.serialize();
    if (state.status !== 'active') {
      throw new MatchDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before creating a match',
      );
    }
    return state.teams
      .filter((team) => team.active)
      .map((team) => ({ id: team.id, name: team.name }));
  }

  /**
   * The canonical server coin toss: one fair 50/50, resolved and stored server
   * side. No client supplies or influences the outcome, in either setup mode.
   */
  private tossCoin(teams: readonly MatchTeam[], now: Date): MatchCoinToss {
    const roll = randomInt(0, teams.length);
    return { winnerTeamId: teams[roll].id, roll, resolvedAt: now };
  }

  /**
   * A replayed command and a stale revision both return or throw before the
   * save, so neither can announce a transition that did not happen.
   */
  private async mutate(
    command: MatchCommand,
    reason: MatchTransitionReason | ((match: Match) => MatchTransitionReason),
    apply: (match: Match, now: Date) => void | Promise<void>,
  ): Promise<Match> {
    const match = await this.load(command);
    match.assertRevision(command.expectedMatchRevision);
    if (match.isDuplicate(command.commandId)) return match;
    const revision = match.revision;
    await apply(match, this.clock.now());
    await this.matches.save(match, revision);
    this.transitions.publish(
      match,
      typeof reason === 'function' ? reason(match) : reason,
    );
    return match;
  }

  private async load(command: MatchCommand): Promise<Match> {
    await this.requireControlledSession(command.sessionId, command.actorId);
    const match = await this.matches.findActiveBySessionId(command.sessionId);
    if (!match) {
      throw new MatchNotFoundError(
        'This live session has no match in progress',
      );
    }
    if (match.status === MatchStatus.CANCELLED) {
      throw new MatchDomainError('MATCH_CANCELLED', 'This match was cancelled');
    }
    return match;
  }

  /**
   * Only the session controller drives a Match. Participants read the Match
   * through their session snapshot and never issue a Match command.
   */
  private async requireControlledSession(sessionId: string, actorId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.controllerActorId !== actorId) {
      throw new MatchForbiddenError();
    }
    return session;
  }
}

/** Deterministic command ids for server-initiated Match commands. */
export function reconciliationCommandId(runtimeId: string): string {
  return `reconcile:${runtimeId}`;
}

export function newMatchCommandId(): string {
  return randomUUID();
}
