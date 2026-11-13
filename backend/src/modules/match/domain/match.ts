import { randomUUID } from 'crypto';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ScoreEvent } from '../../scoring/domain/score-event';
import { ScoreLedger } from '../../scoring/domain/score-ledger';
import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import { MatchBoardPositionKey } from './match-board-position-key';
import { MatchChallengeReadinessRequirement } from './match-challenge-readiness';
import {
  MATCH_SCOPES_PER_OCCURRENCE,
  MATCH_SLOT_ORDER,
  MATCH_UNIFIED_BOARD_POSITION_COUNT,
  MatchSetupMode,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
  WorldSelectionMethod,
} from './match.constants';
import { MatchDomainError, MatchStaleRevisionError } from './match.errors';
import {
  MatchBoardPositionConfiguration,
  UnifiedMatchBoardPosition,
  unifiedMatchBoardPolicy,
} from './unified-match-board.policy';
import { unifiedMatchSetupPolicy } from './unified-match-setup.policy';
import { TeamActionAssignmentState } from '../../live-game-sessions/domain/team-action-assignment';

export interface MatchTeam {
  id: string;
  name: string;
}

export type MatchDoubleStatus = 'available' | 'armed' | 'consumed';

export interface MatchTeamDouble {
  teamId: string;
  status: MatchDoubleStatus;
  armedPositionKey?: string;
  consumedPositionKey?: string;
  consumedAt?: Date;
}

export interface MatchCoinToss {
  winnerTeamId: string;
  /** Kept so a replayed animation always lands on the stored outcome. */
  roll: number;
  resolvedAt: Date;
}

export interface MatchWorldSelection {
  occurrenceIndex: number;
  worldId: string;
  method: WorldSelectionMethod;
  selectedByTeamId?: string;
  selectedAt: Date;
}

/** Match-owned progress for one board position of one World occurrence. */
export interface MatchSlotProgress {
  status: MatchSlotStatus;
  challengeKey?: string;
  runtimeId?: string;
  contentItemIds?: string[];
  startedAt?: Date;
  completedAt?: Date;
  /** Ids of the imported events, so a repeated terminal cannot double-count. */
  scoreEventIds?: string[];
  summary?: Record<string, unknown>;
}

/**
 * One World *occurrence*. Progress belongs to the occurrence, not the worldId, so
 * a Match that plays Football at positions 1 and 3 keeps two separate boards.
 */
export interface MatchWorldOccurrence {
  index: number;
  worldId: string;
  /**
   * The four Scopes this occurrence draws its content from. Every challenge on
   * this occurrence's board pulls ContentItems from this pool and nowhere else.
   * A repeated World answers this again, so two occurrences of one World can be
   * played from completely different Scopes.
   */
  selectedScopeIds: string[];
  selectedScopesAt?: Date;
  /** The board positions this Match scheduled for this occurrence. */
  scheduledSlotKeys: WorldChallengeSlotKey[];
  slots: Partial<Record<WorldChallengeSlotKey, MatchSlotProgress>>;
  completedAt?: Date;
}

/**
 * A board position that has been chosen but not started.
 *
 * It exists so a phone-required mechanic can gather its players before anything
 * irreversible happens: no runtime, no drawn content, and the position itself is
 * still `available`. Cancelling deletes this and nothing else.
 */
export interface MatchPendingChallenge {
  occurrenceIndex: number;
  slotKey: WorldChallengeSlotKey;
  /** `occurrenceIndex + slotKey`; the same identity the board uses. */
  positionKey: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  requiresPhones: boolean;
  /** The phone conditions this mechanic declared, persisted so a reload agrees. */
  readiness?: MatchChallengeReadinessRequirement;
  preparedAt: Date;
  /** The command that prepared it, so a replay is recognised. */
  commandId: string;
  /** The join code the host is showing, when one was needed. */
  joinCode?: string;
  /** Which team's choice this was, when the Match tracks selection turns. */
  selectingTeamId?: string;
  /** Server-selected participant allowed to arm each team's Double. */
  doubleAssignments?: TeamActionAssignmentState;
}

export interface MatchCurrentChallenge {
  occurrenceIndex: number;
  slotKey: WorldChallengeSlotKey;
  challengeKey: string;
  runtimeId: string;
  contentItemIds: string[];
  startedAt: Date;
  /** Public only after launch; both teams may have armed independently. */
  doubledTeamIds: string[];
}

export interface MatchTeamScore {
  teamId: string;
  signedTotal: number;
  displayTotal: number;
}

export interface MatchResult {
  teams: MatchTeamScore[];
  winnerTeamId: string | null;
  tie: boolean;
  worlds: Array<{
    occurrenceIndex: number;
    worldId: string;
    subtotals: MatchTeamScore[];
    completedAt?: Date;
  }>;
}

/**
 * An immutable record of one finished challenge.
 *
 * Written once, when the challenge resolves, and never touched again. It is the
 * authority for the result screen and the seed of Match history: everything the
 * host is shown after a challenge is read from here, so no client reconstructs a
 * result from socket traffic and no client recomputes a winner.
 */
export interface MatchChallengeResult {
  id: string;
  positionKey: string;
  occurrenceIndex: number;
  slotKey: WorldChallengeSlotKey;
  worldId: string;
  worldName?: string;
  selectedScopeIds: string[];
  challengeTypeId: string;
  challengeTypeSlug: string;
  /** The launcher key the runtime actually ran under. */
  challengeKey: string;
  challengeName?: string;
  runtimeId: string;
  contentItemIds: string[];
  /** Decided by the mechanic, server side. Null when the challenge tied. */
  winnerTeamId: string | null;
  /** True when the mechanic declared no winner. Then no Match point exists. */
  tie: boolean;
  double: {
    consumedTeamIds: string[];
    appliedTeamId: string | null;
  };
  /**
   * The **Match** points this challenge moved: exactly `+1` to the winner and
   * `0` to the loser, or `0` to both on a tie. Never a mechanic's internal
   * margin — that lives in `details` and in `mechanicScoreEvents`.
   *
   * Renamed from `teamPoints`, which used to carry whatever the mechanic minted
   * and therefore meant "Match points" for Top 5 and "signed payoff swings" for
   * RYO. One name cannot mean two things in a ledger.
   */
  matchPoints: Array<{ teamId: string; points: number }>;
  /**
   * The id of the single Match-level event that represents this challenge's
   * point, or null on a tie. The anti-double-award anchor.
   */
  matchPointEventId: string | null;
  /**
   * The mechanic's own signed events, kept verbatim for the recap and never
   * summed into the Match. RYO's per-item payoffs live here.
   */
  mechanicScoreEvents: Array<Record<string, unknown>>;
  /** The Match-level event ids this result imported. At most one. */
  scoreEventIds: string[];
  /** Mechanic-shaped, client-safe facts: entries, ownership, reveal order… */
  details: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date;
}

export interface MatchState {
  id: string;
  liveSessionId: string;
  /** Which journey this Match obeys. Persisted, never inferred. */
  setupMode: MatchSetupMode;
  status: MatchStatus;
  stage: MatchStage;
  stageEnteredAt: Date;
  teams: MatchTeam[];
  /** Exactly one server-owned Double token per team for the whole Match. */
  teamDoubles: MatchTeamDouble[];
  coinToss?: MatchCoinToss;
  selections: MatchWorldSelection[];
  occurrences: MatchWorldOccurrence[];
  /**
   * Unified only: the twelve board positions and the mechanic configured in each,
   * captured at creation so a reload rebuilds exactly this board.
   */
  configuredBoardPositions: MatchBoardPositionConfiguration[];
  /** Unified only: the team whose turn it is to choose a board position. */
  selectingTeamId?: string;
  /**
   * Unified only: the position waiting on phones. At most one, ever — the
   * `preflight` stage is what enforces that.
   */
  pendingChallenge?: MatchPendingChallenge;
  currentChallenge?: MatchCurrentChallenge;
  scoreEvents: ScoreEvent[];
  /**
   * Every finished challenge, oldest first. Append-only: a new result never
   * replaces an older one, which is what makes this usable as Match history.
   */
  challengeResults: MatchChallengeResult[];
  /**
   * The result the Match is currently standing on. Set exactly while the stage
   * is `challenge_result`, and cleared by the continue command.
   */
  pendingResultId?: string;
  processedCommandIds: string[];
  revision: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const MAX_PROCESSED_COMMANDS = 200;
const NEXT_CHALLENGE_DOUBLE_POSITION = '__next__';

/**
 * The authoritative Match aggregate.
 *
 * It owns the journey — coin toss, World selection, board progress, cross-challenge
 * scoring, completion — and deliberately knows nothing about how a mechanic runs.
 * Mechanic execution stays in GameplayRuntime; the Match only binds a slot to a
 * runtime id and later imports the signed events that runtime produced.
 */
export class Match {
  private constructor(private readonly state: MatchState) {}

  /**
   * Creates a fully configured Match in one step.
   *
   * Everything a Match needs is decided before it exists: its three World
   * occurrences, each occurrence's four Scopes, the mechanic in each of the
   * twelve board positions, and which team selects first. There is therefore
   * nothing left to ask a player, so the Match opens directly on its board — it
   * never passes through a coin-toss, world-selection, or scope-selection stage,
   * and it can never be half-configured, because a rejected configuration
   * produces no Match at all.
   *
   * The coin toss is still resolved and stored, so the settled result can be
   * shown; it simply requires no command.
   */
  static createUnified(input: {
    id?: string;
    liveSessionId: string;
    teams: MatchTeam[];
    occurrences: readonly ConfiguredWorldOccurrence[];
    boardPositions: readonly MatchBoardPositionConfiguration[];
    coinToss: MatchCoinToss;
    now: Date;
  }): Match {
    Match.assertTwoTeams(input.teams);
    if (!input.teams.some((team) => team.id === input.coinToss.winnerTeamId)) {
      throw new MatchDomainError(
        'MATCH_TEAM_UNKNOWN',
        'The coin toss winner is not one of the two match teams',
      );
    }
    // The same policy the setup validator used: nothing is constructed around a
    // configuration that has not passed it.
    const configured = unifiedMatchSetupPolicy.assertConfiguration(
      input.occurrences,
    );
    const positions = [...input.boardPositions];
    if (positions.length !== MATCH_UNIFIED_BOARD_POSITION_COUNT) {
      throw new MatchDomainError(
        'UNIFIED_BOARD_POSITION_COUNT_INVALID',
        `A unified match board has exactly ${MATCH_UNIFIED_BOARD_POSITION_COUNT} positions, received ${positions.length}`,
      );
    }
    for (const occurrence of configured) {
      const expected = MATCH_SLOT_ORDER.map(
        (slotKey) =>
          MatchBoardPositionKey.of(occurrence.occurrenceIndex, slotKey).value,
      );
      const present = positions
        .filter(
          (position) =>
            position.occurrenceIndex === occurrence.occurrenceIndex &&
            position.worldId === occurrence.worldId,
        )
        .map(
          (position) =>
            MatchBoardPositionKey.of(position.occurrenceIndex, position.slotKey)
              .value,
        );
      if (expected.some((key) => !present.includes(key))) {
        throw new MatchDomainError(
          'UNIFIED_BOARD_POSITION_MISSING',
          `World occurrence ${occurrence.occurrenceIndex} is missing one of its ${MATCH_SLOT_ORDER.length} board positions`,
        );
      }
    }

    return new Match({
      id: input.id ?? randomUUID(),
      liveSessionId: input.liveSessionId,
      setupMode: MatchSetupMode.UNIFIED_PRECONFIGURED,
      status: MatchStatus.ACTIVE,
      stage: MatchStage.BOARD,
      stageEnteredAt: input.now,
      teams: input.teams.map((team) => ({ ...team })),
      teamDoubles: input.teams.map((team) => ({
        teamId: team.id,
        status: 'available',
      })),
      coinToss: { ...input.coinToss },
      selections: configured.map((occurrence) => ({
        occurrenceIndex: occurrence.occurrenceIndex,
        worldId: occurrence.worldId,
        method: WorldSelectionMethod.PRECONFIGURED,
        selectedAt: input.now,
      })),
      occurrences: configured.map((occurrence) => ({
        index: occurrence.occurrenceIndex,
        worldId: occurrence.worldId,
        selectedScopeIds: [...occurrence.selectedScopeIds],
        selectedScopesAt: input.now,
        scheduledSlotKeys: [...MATCH_SLOT_ORDER],
        slots: Object.fromEntries(
          MATCH_SLOT_ORDER.map((slotKey) => [
            slotKey,
            { status: MatchSlotStatus.AVAILABLE },
          ]),
        ),
      })),
      configuredBoardPositions: positions.map((position) => ({ ...position })),
      selectingTeamId: input.coinToss.winnerTeamId,
      scoreEvents: [],
      challengeResults: [],
      processedCommandIds: [],
      revision: 0,
      createdAt: input.now,
      startedAt: input.now,
    });
  }

  static restore(state: MatchState, scoreEvents: ScoreEvent[]): Match {
    return new Match({
      ...state,
      scoreEvents,
      challengeResults: state.challengeResults ?? [],
      teamDoubles: state.teamDoubles?.length
        ? state.teamDoubles
        : state.teams.map((team) => ({
            teamId: team.id,
            status: 'available',
          })),
      currentChallenge: state.currentChallenge
        ? {
            ...state.currentChallenge,
            doubledTeamIds: state.currentChallenge.doubledTeamIds ?? [],
          }
        : undefined,
    });
  }

  private static assertTwoTeams(teams: MatchTeam[]): void {
    if (teams.length !== 2) {
      throw new MatchDomainError(
        'MATCH_REQUIRES_TWO_TEAMS',
        'A match is played by exactly two teams',
      );
    }
    if (new Set(teams.map((team) => team.id)).size !== 2) {
      throw new MatchDomainError(
        'MATCH_REQUIRES_TWO_TEAMS',
        'The two match teams must be distinct',
      );
    }
  }

  get id(): string {
    return this.state.id;
  }
  get liveSessionId(): string {
    return this.state.liveSessionId;
  }
  get revision(): number {
    return this.state.revision;
  }
  get stage(): MatchStage {
    return this.state.stage;
  }
  get status(): MatchStatus {
    return this.state.status;
  }
  get currentChallenge(): MatchCurrentChallenge | undefined {
    return this.state.currentChallenge;
  }
  get teams(): readonly MatchTeam[] {
    return this.state.teams;
  }
  get teamDoubles(): readonly MatchTeamDouble[] {
    return this.state.teamDoubles;
  }
  get coinToss(): MatchCoinToss | undefined {
    return this.state.coinToss;
  }
  get selections(): readonly MatchWorldSelection[] {
    return this.state.selections;
  }
  get occurrences(): readonly MatchWorldOccurrence[] {
    return this.state.occurrences;
  }
  get setupMode(): MatchSetupMode {
    return this.state.setupMode;
  }
  /** Unified only: whose turn it is to choose the next board position. */
  get selectingTeamId(): string | undefined {
    return this.state.selectingTeamId;
  }
  /** Unified only: the position chosen and waiting on its phones. */
  get pendingChallenge(): MatchPendingChallenge | undefined {
    return this.state.pendingChallenge;
  }

  /** Every finished challenge, oldest first. Append-only Match history. */
  get challengeResults(): readonly MatchChallengeResult[] {
    return this.state.challengeResults;
  }

  /** The result the Match is standing on, while it is standing on one. */
  get pendingResult(): MatchChallengeResult | undefined {
    return this.state.challengeResults.find(
      (result) => result.id === this.state.pendingResultId,
    );
  }

  /**
   * All twelve board positions of a unified Match: the configuration captured at
   * creation merged with the progress the Match owns, keyed by
   * `occurrenceIndex + slotKey`.
   */
  unifiedBoard(): UnifiedMatchBoardPosition[] {
    return this.state.configuredBoardPositions.map((position) => {
      const occurrence = this.state.occurrences.find(
        (candidate) => candidate.index === position.occurrenceIndex,
      );
      const progress = occurrence?.slots[position.slotKey];
      return {
        ...position,
        positionKey: unifiedMatchBoardPolicy.keyOf(position).value,
        selectedScopeIds: [...(occurrence?.selectedScopeIds ?? [])],
        status: progress?.status ?? MatchSlotStatus.UNAVAILABLE,
        ...(progress?.runtimeId ? { runtimeId: progress.runtimeId } : {}),
        ...(progress?.completedAt ? { completedAt: progress.completedAt } : {}),
      };
    });
  }

  /**
   * Whether a board position could be launched right now.
   *
   * Read-only, and the same checks `launchChallenge` makes before it mutates. It
   * exists so a caller can refuse *before* starting a mechanic runtime, rather
   * than creating one the aggregate would then decline to bind.
   */
  assertPositionLaunchable(input: {
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
    selectingTeamId?: string;
    doubleAssignments?: TeamActionAssignmentState;
  }): void {
    this.assertStage([MatchStage.BOARD, MatchStage.PREFLIGHT]);
    const occurrence = this.requireLaunchableOccurrence(input.occurrenceIndex);
    this.assertSelectionAuthority(input.selectingTeamId);
    const slot = occurrence.slots[input.slotKey];
    if (!slot) {
      throw new MatchDomainError(
        'BOARD_SLOT_NOT_SCHEDULED',
        `The ${input.slotKey} position is not scheduled for this World occurrence`,
      );
    }
    if (slot.status !== MatchSlotStatus.AVAILABLE) {
      throw new MatchDomainError(
        'BOARD_SLOT_NOT_AVAILABLE',
        `The ${input.slotKey} position is ${slot.status}`,
      );
    }
  }

  assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new MatchStaleRevisionError(expected, this.state.revision);
    }
  }

  isDuplicate(commandId: string): boolean {
    return this.state.processedCommandIds.includes(commandId);
  }

  /** The content pool of the occurrence being played. */
  selectedScopeIds(occurrenceIndex: number): string[] {
    const occurrence = this.state.occurrences.find(
      (candidate) => candidate.index === occurrenceIndex,
    );
    return [...(occurrence?.selectedScopeIds ?? [])];
  }

  hasCompleteScopeSelection(occurrenceIndex: number): boolean {
    return (
      this.selectedScopeIds(occurrenceIndex).length ===
      MATCH_SCOPES_PER_OCCURRENCE
    );
  }

  /** Every ContentItem this occurrence has already consumed. */
  usedContentItemIds(occurrenceIndex: number): string[] {
    const occurrence = this.state.occurrences.find(
      (candidate) => candidate.index === occurrenceIndex,
    );
    return Object.values(occurrence?.slots ?? {}).flatMap(
      (slot) => slot?.contentItemIds ?? [],
    );
  }

  /**
   * Chooses a board position without starting it.
   *
   * Nothing irreversible happens here: no runtime is created, no content is drawn,
   * and the position stays `available`. That is the whole point — a mechanic that
   * needs the players' phones gets a moment to collect them, and a Match that never
   * launches is indistinguishable from one where the position was never chosen.
   */
  prepareChallenge(input: {
    commandId: string;
    now: Date;
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
    challengeTypeId: string;
    challengeTypeSlug: string;
    requiresPhones: boolean;
    readiness?: MatchChallengeReadinessRequirement;
    joinCode?: string;
    selectingTeamId?: string;
    doubleAssignments?: TeamActionAssignmentState;
  }): void {
    if (this.replay(input.commandId)) return;
    // Only from the board, which is also what keeps a second pending challenge
    // from ever existing.
    this.assertStage([MatchStage.BOARD]);
    this.assertPositionLaunchable({
      occurrenceIndex: input.occurrenceIndex,
      slotKey: input.slotKey,
      ...(input.selectingTeamId
        ? { selectingTeamId: input.selectingTeamId }
        : {}),
    });
    this.state.pendingChallenge = {
      occurrenceIndex: input.occurrenceIndex,
      slotKey: input.slotKey,
      positionKey: MatchBoardPositionKey.of(
        input.occurrenceIndex,
        input.slotKey,
      ).value,
      challengeTypeId: input.challengeTypeId,
      challengeTypeSlug: input.challengeTypeSlug,
      requiresPhones: input.requiresPhones,
      ...(input.readiness ? { readiness: input.readiness } : {}),
      preparedAt: input.now,
      commandId: input.commandId,
      ...(input.joinCode ? { joinCode: input.joinCode } : {}),
      ...(input.selectingTeamId
        ? { selectingTeamId: input.selectingTeamId }
        : {}),
      ...(input.doubleAssignments
        ? { doubleAssignments: input.doubleAssignments }
        : {}),
    };
    this.state.teamDoubles = this.state.teamDoubles.map((token) =>
      token.status === 'armed' &&
      token.armedPositionKey === NEXT_CHALLENGE_DOUBLE_POSITION
        ? {
            ...token,
            armedPositionKey: this.state.pendingChallenge?.positionKey,
          }
        : token,
    );
    this.enterStage(MatchStage.PREFLIGHT, input.now);
    this.commit(input.commandId);
  }

  /**
   * Abandons a prepared position and returns to the board.
   *
   * Deliberately restores nothing, because nothing was consumed: no content was
   * drawn, no score moved, and the selecting team does not change — it is still
   * that team's choice to make.
   */
  cancelPreflight(input: { commandId: string; now: Date }): void {
    if (this.replay(input.commandId)) return;
    this.assertStage([MatchStage.PREFLIGHT]);
    const positionKey = this.state.pendingChallenge?.positionKey;
    this.state.teamDoubles = this.state.teamDoubles.map((token) =>
      token.status === 'armed' && token.armedPositionKey === positionKey
        ? { teamId: token.teamId, status: 'available' }
        : token,
    );
    this.state.pendingChallenge = undefined;
    this.enterStage(MatchStage.BOARD, input.now);
    this.commit(input.commandId);
  }

  /** Arms or cancels a team's one Match-level Double during preflight only. */
  setTeamDouble(input: {
    commandId: string;
    now: Date;
    teamId: string;
    armed: boolean;
  }): void {
    if (this.replay(input.commandId)) return;
    this.assertStage([MatchStage.PREFLIGHT]);
    this.assertTeam(input.teamId);
    const pending = this.state.pendingChallenge;
    if (!pending) {
      throw new MatchDomainError(
        'MATCH_NO_PENDING_CHALLENGE',
        'A Double can only be armed for a prepared challenge',
      );
    }
    const token = this.state.teamDoubles.find(
      (candidate) => candidate.teamId === input.teamId,
    );
    if (!token || token.status === 'consumed') {
      throw new MatchDomainError(
        'MATCH_DOUBLE_UNAVAILABLE',
        'This team has already used its Double',
      );
    }
    if (input.armed) {
      token.status = 'armed';
      token.armedPositionKey = pending.positionKey;
    } else {
      token.status = 'available';
      token.armedPositionKey = undefined;
    }
    this.commit(input.commandId);
  }

  /** Arms the selecting team's one Double for its next chosen challenge. */
  armSelectingTeamDouble(input: { commandId: string; teamId: string }): void {
    if (this.replay(input.commandId)) return;
    this.assertStage([MatchStage.BOARD]);
    this.assertSelectionAuthority(input.teamId);
    const token = this.state.teamDoubles.find(
      (candidate) => candidate.teamId === input.teamId,
    );
    if (!token || token.status !== 'available') {
      throw new MatchDomainError(
        'MATCH_DOUBLE_UNAVAILABLE',
        'This team has already used or armed its Double',
      );
    }
    token.status = 'armed';
    token.armedPositionKey = NEXT_CHALLENGE_DOUBLE_POSITION;
    this.commit(input.commandId);
  }

  /** Imports one controller correction through the canonical score ledger. */
  applyManualScoreCorrection(input: {
    commandId: string;
    event: ScoreEvent;
  }): void {
    if (this.replay(input.commandId)) return;
    this.assertStage([MatchStage.BOARD]);
    this.assertTeam(input.event.teamId);
    if (!this.state.scoreEvents.some((event) => event.id === input.event.id)) {
      this.state.scoreEvents.push(input.event);
    }
    this.commit(input.commandId);
  }

  /** Switches board selection authority without entering mechanic turn logic. */
  switchSelectingTeam(input: { commandId: string }): void {
    if (this.replay(input.commandId)) return;
    this.assertStage([MatchStage.BOARD]);
    if (!this.state.selectingTeamId) {
      throw new MatchDomainError(
        'MATCH_SELECTING_TEAM_MISSING',
        'This match has no selecting team to switch',
      );
    }
    this.state.teamDoubles = this.state.teamDoubles.map((token) =>
      token.status === 'armed' &&
      token.armedPositionKey === NEXT_CHALLENGE_DOUBLE_POSITION
        ? { teamId: token.teamId, status: 'available' }
        : token,
    );
    this.state.selectingTeamId = unifiedMatchBoardPolicy.nextSelectingTeamId(
      this.state.teams.map((team) => team.id),
      this.state.selectingTeamId,
    );
    this.commit(input.commandId);
  }

  /**
   * The position a prepared preflight is holding, asserted to be the one a launch
   * names. A launch that has drifted from its preflight is refused rather than
   * quietly launching something else.
   */
  requirePendingChallenge(input: {
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
  }): MatchPendingChallenge {
    const pending = this.state.pendingChallenge;
    if (!pending) {
      throw new MatchDomainError(
        'MATCH_NO_PENDING_CHALLENGE',
        'No board position is prepared for launch',
      );
    }
    if (
      pending.occurrenceIndex !== input.occurrenceIndex ||
      pending.slotKey !== input.slotKey
    ) {
      throw new MatchDomainError(
        'MATCH_PENDING_CHALLENGE_MISMATCH',
        `The prepared position is ${pending.positionKey}, not ${MatchBoardPositionKey.of(input.occurrenceIndex, input.slotKey).value}`,
      );
    }
    return pending;
  }

  /**
   * Binds a board position to a gameplay runtime. The binding is authoritative:
   * the Match never reads the World or slot back out of the runtime state.
   *
   * The position is named explicitly by `occurrenceIndex + slotKey`, and any
   * available position of any of the three occurrences may be launched, in any
   * order.
   */
  launchChallenge(input: {
    commandId: string;
    now: Date;
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
    challengeKey: string;
    runtimeId: string;
    contentItemIds: string[];
    launchability: MatchSlotLaunchability;
    /** The team claiming board selection for this launch. */
    selectingTeamId?: string;
  }): void {
    if (this.replay(input.commandId)) return;
    // A launch may come straight from the board, or from a preflight that has
    // just satisfied its phone requirement.
    this.assertStage([MatchStage.BOARD, MatchStage.PREFLIGHT]);
    const occurrence = this.requireLaunchableOccurrence(input.occurrenceIndex);
    this.assertSelectionAuthority(input.selectingTeamId);
    if (occurrence.selectedScopeIds.length !== MATCH_SCOPES_PER_OCCURRENCE) {
      throw new MatchDomainError(
        'SCOPE_SELECTION_INCOMPLETE',
        `This World occurrence needs ${MATCH_SCOPES_PER_OCCURRENCE} Scopes before a challenge can start`,
      );
    }
    const slot = occurrence.slots[input.slotKey];
    if (!slot) {
      throw new MatchDomainError(
        'BOARD_SLOT_NOT_SCHEDULED',
        `The ${input.slotKey} position is not scheduled for this World occurrence`,
      );
    }
    if (slot.status !== MatchSlotStatus.AVAILABLE) {
      throw new MatchDomainError(
        'BOARD_SLOT_NOT_AVAILABLE',
        `The ${input.slotKey} position is ${slot.status}`,
      );
    }
    if (input.launchability !== MatchSlotLaunchability.LAUNCHABLE) {
      throw new MatchDomainError(
        'CHALLENGE_NOT_LAUNCHABLE',
        `The mechanic in the ${input.slotKey} position is ${input.launchability}`,
      );
    }
    occurrence.slots[input.slotKey] = {
      status: MatchSlotStatus.IN_PROGRESS,
      challengeKey: input.challengeKey,
      runtimeId: input.runtimeId,
      contentItemIds: [...input.contentItemIds],
      startedAt: input.now,
    };
    this.state.currentChallenge = {
      occurrenceIndex: occurrence.index,
      slotKey: input.slotKey,
      challengeKey: input.challengeKey,
      runtimeId: input.runtimeId,
      contentItemIds: [...input.contentItemIds],
      startedAt: input.now,
      doubledTeamIds: this.state.teamDoubles
        .filter(
          (token) =>
            token.status === 'armed' &&
            token.armedPositionKey ===
              MatchBoardPositionKey.of(occurrence.index, input.slotKey).value,
        )
        .map((token) => token.teamId),
    };
    const doubledTeamIds = new Set(this.state.currentChallenge.doubledTeamIds);
    this.state.teamDoubles = this.state.teamDoubles.map((token) =>
      doubledTeamIds.has(token.teamId)
        ? {
            teamId: token.teamId,
            status: 'consumed',
            consumedPositionKey: MatchBoardPositionKey.of(
              occurrence.index,
              input.slotKey,
            ).value,
            consumedAt: input.now,
          }
        : token,
    );
    // The preflight has done its job; the runtime is now the authority.
    this.state.pendingChallenge = undefined;
    this.enterStage(MatchStage.CHALLENGE, input.now);
    this.commit(input.commandId);
  }

  /**
   * Completes the bound challenge, imports its signed events exactly once, and
   * stops the Match on the result.
   *
   * Scoring happens here and only here: the events are imported, the immutable
   * ChallengeResult is appended, and the Match enters `challenge_result`. It does
   * *not* return to the board — that is a separate, explicit command, which is
   * what makes a refresh during the reveal restore the reveal.
   *
   * Idempotent by design: a repeated terminal notification finds the slot already
   * completed and the event ids already present, so nothing double-counts and no
   * second result is appended.
   */
  completeChallenge(input: {
    commandId: string;
    now: Date;
    runtimeId: string;
    events: ScoreEvent[];
    summary?: Record<string, unknown>;
    /** Decided by the mechanic; the Match never derives a winner itself. */
    winnerTeamId?: string | null;
    challengeKey?: string;
    /** The mechanic's own signed events. Recorded, never scored. */
    mechanicEvents?: Array<Record<string, unknown>>;
  }): { completed: boolean; result?: MatchChallengeResult } {
    if (this.replay(input.commandId)) return { completed: false };
    const binding = this.findBinding(input.runtimeId);
    if (!binding) return { completed: false };
    const { occurrence, slotKey, slot } = binding;
    if (slot.status === MatchSlotStatus.COMPLETED) return { completed: false };

    const imported = input.events.filter(
      (event) => !this.state.scoreEvents.some((kept) => kept.id === event.id),
    );
    this.state.scoreEvents.push(...imported);
    const scoreEventIds = input.events.map((event) => event.id);
    occurrence.slots[slotKey] = {
      ...slot,
      status: MatchSlotStatus.COMPLETED,
      completedAt: input.now,
      scoreEventIds,
      ...(input.summary ? { summary: input.summary } : {}),
    };
    if (
      occurrence.scheduledSlotKeys.every(
        (key) => occurrence.slots[key]?.status === MatchSlotStatus.COMPLETED,
      )
    ) {
      occurrence.completedAt = input.now;
    }
    const result = this.recordChallengeResult({
      occurrence,
      slotKey,
      slot,
      runtimeId: input.runtimeId,
      events: input.events,
      scoreEventIds,
      now: input.now,
      details: input.summary ?? {},
      winnerTeamId: input.winnerTeamId ?? null,
      challengeKey: input.challengeKey ?? slot.challengeKey ?? '',
      mechanicEvents: input.mechanicEvents ?? [],
      doubledTeamIds: this.state.currentChallenge?.doubledTeamIds ?? [],
    });
    this.state.challengeResults.push(result);
    this.state.pendingResultId = result.id;
    this.state.currentChallenge = undefined;
    this.enterStage(MatchStage.CHALLENGE_RESULT, input.now);
    this.commit(input.commandId);
    return { completed: true, result };
  }

  /**
   * Releases a legitimately launched challenge without completing it.
   *
   * Runtime cancellation is the durable fact that drives this transition. The
   * position becomes playable again, no result or score is recorded, and any
   * Double consumed only by this abandoned attempt is returned to its available
   * state. A stale cancellation for another runtime cannot release the current
   * challenge.
   */
  abortChallenge(input: { commandId: string; now: Date; runtimeId: string }): {
    aborted: boolean;
  } {
    if (this.replay(input.commandId)) return { aborted: false };
    const current = this.state.currentChallenge;
    if (!current || current.runtimeId !== input.runtimeId) {
      return { aborted: false };
    }
    this.assertStage([MatchStage.CHALLENGE]);
    const occurrence = this.requireLaunchableOccurrence(
      current.occurrenceIndex,
    );
    const slot = occurrence.slots[current.slotKey];
    if (
      !slot ||
      slot.status !== MatchSlotStatus.IN_PROGRESS ||
      slot.runtimeId !== input.runtimeId
    ) {
      throw new MatchDomainError(
        'MATCH_CHALLENGE_BINDING_INVALID',
        'The active challenge binding does not match its board position',
      );
    }
    occurrence.slots[current.slotKey] = {
      status: MatchSlotStatus.AVAILABLE,
    };
    const consumed = new Set(current.doubledTeamIds);
    this.state.teamDoubles = this.state.teamDoubles.map((token) =>
      token.status === 'consumed' &&
      token.consumedPositionKey ===
        MatchBoardPositionKey.of(current.occurrenceIndex, current.slotKey)
          .value &&
      consumed.has(token.teamId)
        ? { teamId: token.teamId, status: 'available' }
        : token,
    );
    this.state.currentChallenge = undefined;
    this.state.pendingResultId = undefined;
    this.enterStage(MatchStage.BOARD, input.now);
    this.commit(input.commandId);
    return { aborted: true };
  }

  /**
   * Leaves the result screen: back to the board, or to the end of the Match.
   *
   * The only thing that moves a Match off `challenge_result`. It awards nothing
   * and computes nothing — every point was already imported when the result was
   * recorded — so pressing it twice, or replaying the command after a reconnect,
   * cannot change a score.
   */
  continueFromChallengeResult(input: { commandId: string; now: Date }): {
    stage: MatchStage;
  } {
    if (this.replay(input.commandId)) return { stage: this.state.stage };
    this.assertStage([MatchStage.CHALLENGE_RESULT]);
    this.state.pendingResultId = undefined;
    if (this.state.selectingTeamId) {
      this.state.selectingTeamId = unifiedMatchBoardPolicy.nextSelectingTeamId(
        this.state.teams.map((team) => team.id),
        this.state.selectingTeamId,
      );
    }
    if (unifiedMatchBoardPolicy.isComplete(this.unifiedBoard())) {
      this.state.status = MatchStatus.COMPLETED;
      this.state.completedAt = input.now;
      this.enterStage(MatchStage.MATCH_COMPLETE, input.now);
    } else {
      this.enterStage(MatchStage.BOARD, input.now);
    }
    this.commit(input.commandId);
    return { stage: this.state.stage };
  }

  /**
   * The immutable facts of one finished challenge, assembled once.
   *
   * The board position, the World, the Scope pool, the mechanic, the winner the
   * mechanic declared, the points that moved and the ids of the events that moved
   * them. Enough to explain the challenge later without re-reading a runtime that
   * may no longer exist.
   */
  private recordChallengeResult(input: {
    occurrence: MatchWorldOccurrence;
    slotKey: WorldChallengeSlotKey;
    slot: MatchSlotProgress;
    runtimeId: string;
    events: ScoreEvent[];
    scoreEventIds: string[];
    now: Date;
    details: Record<string, unknown>;
    winnerTeamId: string | null;
    challengeKey: string;
    mechanicEvents: Array<Record<string, unknown>>;
    doubledTeamIds: string[];
  }): MatchChallengeResult {
    const positionKey = MatchBoardPositionKey.of(
      input.occurrence.index,
      input.slotKey,
    ).value;
    const configured = this.state.configuredBoardPositions.find(
      (position) =>
        position.occurrenceIndex === input.occurrence.index &&
        position.slotKey === input.slotKey,
    );
    return {
      id: randomUUID(),
      positionKey,
      occurrenceIndex: input.occurrence.index,
      slotKey: input.slotKey,
      worldId: input.occurrence.worldId,
      ...(configured?.worldName ? { worldName: configured.worldName } : {}),
      selectedScopeIds: [...input.occurrence.selectedScopeIds],
      challengeTypeId: configured?.challengeTypeId ?? '',
      challengeTypeSlug: configured?.challengeTypeSlug ?? input.challengeKey,
      challengeKey: input.challengeKey,
      ...(configured?.displayName
        ? { challengeName: configured.displayName }
        : {}),
      runtimeId: input.runtimeId,
      contentItemIds: [...(input.slot.contentItemIds ?? [])],
      winnerTeamId: input.winnerTeamId,
      tie: input.winnerTeamId === null,
      double: {
        consumedTeamIds: [...input.doubledTeamIds],
        appliedTeamId:
          input.winnerTeamId &&
          input.doubledTeamIds.includes(input.winnerTeamId)
            ? input.winnerTeamId
            : null,
      },
      // Derived from the imported Match-level events, which are now exactly one
      // (+1 to the winner) or none. A loser is recorded explicitly as 0 so the
      // result reads as a complete statement rather than a single-sided one.
      matchPoints: this.state.teams.map((team) => ({
        teamId: team.id,
        points: input.events
          .filter((event) => event.teamId === team.id)
          .reduce((total, event) => total + event.delta, 0),
      })),
      matchPointEventId: input.events[0]?.id ?? null,
      mechanicScoreEvents: input.mechanicEvents.map((event) => ({ ...event })),
      scoreEventIds: [...input.scoreEventIds],
      details: input.details,
      startedAt: input.slot.startedAt ?? input.now,
      completedAt: input.now,
    };
  }

  cancel(input: { commandId: string; now: Date }): void {
    if (this.replay(input.commandId)) return;
    if (this.state.status === MatchStatus.COMPLETED) {
      throw new MatchDomainError(
        'MATCH_ALREADY_COMPLETED',
        'A completed match cannot be cancelled',
      );
    }
    this.state.status = MatchStatus.CANCELLED;
    this.state.currentChallenge = undefined;
    this.state.completedAt = input.now;
    this.commit(input.commandId);
  }

  /** Signed and display totals for one team across the whole Match. */
  teamScore(teamId: string): MatchTeamScore {
    const ledger = this.ledger();
    return {
      teamId,
      signedTotal: ledger.signedTotal(teamId),
      displayTotal: ledger.displayTotal(teamId),
    };
  }

  /** Subtotals for one World occurrence, derived from the imported events. */
  worldSubtotals(occurrenceIndex: number): MatchTeamScore[] {
    const occurrence = this.state.occurrences.find(
      (candidate) => candidate.index === occurrenceIndex,
    );
    const eventIds = new Set(
      Object.values(occurrence?.slots ?? {}).flatMap(
        (slot) => slot?.scoreEventIds ?? [],
      ),
    );
    const events = this.state.scoreEvents.filter((event) =>
      eventIds.has(event.id),
    );
    return this.state.teams.map((team) => {
      const signedTotal = events
        .filter((event) => event.teamId === team.id)
        .reduce((total, event) => total + event.delta, 0);
      return {
        teamId: team.id,
        signedTotal,
        displayTotal: Math.max(0, signedTotal),
      };
    });
  }

  /** The derived result. Nothing here is stored as a mutable total. */
  result(): MatchResult {
    const teams = this.state.teams.map((team) => this.teamScore(team.id));
    const best = Math.max(...teams.map((team) => team.signedTotal));
    const leaders = teams.filter((team) => team.signedTotal === best);
    return {
      teams,
      winnerTeamId: leaders.length === 1 ? leaders[0].teamId : null,
      tie: leaders.length !== 1,
      worlds: this.state.occurrences.map((occurrence) => ({
        occurrenceIndex: occurrence.index,
        worldId: occurrence.worldId,
        subtotals: this.worldSubtotals(occurrence.index),
        ...(occurrence.completedAt
          ? { completedAt: occurrence.completedAt }
          : {}),
      })),
    };
  }

  serialize(): MatchState {
    return {
      ...this.state,
      teams: this.state.teams.map((team) => ({ ...team })),
      teamDoubles: this.state.teamDoubles.map((token) => ({ ...token })),
      selections: this.state.selections.map((selection) => ({ ...selection })),
      occurrences: this.state.occurrences.map((occurrence) => ({
        ...occurrence,
        selectedScopeIds: [...occurrence.selectedScopeIds],
        scheduledSlotKeys: [...occurrence.scheduledSlotKeys],
        slots: Object.fromEntries(
          Object.entries(occurrence.slots).map(([key, slot]) => [
            key,
            { ...(slot as MatchSlotProgress) },
          ]),
        ),
      })),
      configuredBoardPositions: this.state.configuredBoardPositions.map(
        (position) => ({ ...position }),
      ),
      ...(this.state.pendingChallenge
        ? {
            pendingChallenge: {
              ...this.state.pendingChallenge,
              ...(this.state.pendingChallenge.doubleAssignments
                ? {
                    doubleAssignments: {
                      ...this.state.pendingChallenge.doubleAssignments,
                      rotations:
                        this.state.pendingChallenge.doubleAssignments.rotations.map(
                          (rotation) => ({
                            ...rotation,
                            order: [...rotation.order],
                          }),
                        ),
                      assignments:
                        this.state.pendingChallenge.doubleAssignments.assignments.map(
                          (assignment) => ({ ...assignment }),
                        ),
                    },
                  }
                : {}),
            },
          }
        : {}),
      scoreEvents: [...this.state.scoreEvents],
      challengeResults: this.state.challengeResults.map((result) => ({
        ...result,
        selectedScopeIds: [...result.selectedScopeIds],
        contentItemIds: [...result.contentItemIds],
        matchPoints: result.matchPoints.map((entry) => ({ ...entry })),
        mechanicScoreEvents: result.mechanicScoreEvents.map((event) => ({
          ...event,
        })),
        scoreEventIds: [...result.scoreEventIds],
        double: {
          ...result.double,
          consumedTeamIds: [...result.double.consumedTeamIds],
        },
      })),
      processedCommandIds: [...this.state.processedCommandIds],
    };
  }

  private ledger(): ScoreLedger {
    const ledger = new ScoreLedger();
    ledger.record(...this.state.scoreEvents);
    return ledger;
  }

  private findBinding(runtimeId: string):
    | {
        occurrence: MatchWorldOccurrence;
        slotKey: WorldChallengeSlotKey;
        slot: MatchSlotProgress;
      }
    | undefined {
    for (const occurrence of this.state.occurrences) {
      for (const [key, slot] of Object.entries(occurrence.slots)) {
        if (slot?.runtimeId === runtimeId) {
          return {
            occurrence,
            slotKey: key as WorldChallengeSlotKey,
            slot,
          };
        }
      }
    }
    return undefined;
  }

  /**
   * The occurrence a launch may target: any of the three, named explicitly. No
   * sequence is consulted — a unified Match has no "current" occurrence.
   */
  private requireLaunchableOccurrence(
    occurrenceIndex: number,
  ): MatchWorldOccurrence {
    const occurrence = this.state.occurrences.find(
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

  /** Only the team holding board selection may open a position. */
  private assertSelectionAuthority(claimedTeamId?: string): void {
    if (!claimedTeamId) return;
    this.assertTeam(claimedTeamId);
    if (claimedTeamId !== this.state.selectingTeamId) {
      throw new MatchDomainError(
        'MATCH_SELECTION_OUT_OF_TURN',
        "It is not that team's turn to choose a board position",
      );
    }
  }

  private assertStage(allowed: MatchStage[]): void {
    if (this.state.status === MatchStatus.CANCELLED) {
      throw new MatchDomainError('MATCH_CANCELLED', 'This match was cancelled');
    }
    if (!allowed.includes(this.state.stage)) {
      throw new MatchDomainError(
        'MATCH_STAGE_INVALID',
        `This action is unavailable while the match is in the ${this.state.stage} stage`,
      );
    }
  }

  private assertTeam(teamId: string): void {
    if (!this.state.teams.some((team) => team.id === teamId)) {
      throw new MatchDomainError(
        'MATCH_TEAM_UNKNOWN',
        'That team is not playing this match',
      );
    }
  }

  private enterStage(stage: MatchStage, now: Date): void {
    this.state.stage = stage;
    this.state.stageEnteredAt = now;
  }

  private replay(commandId: string): boolean {
    return this.isDuplicate(commandId);
  }

  private commit(commandId: string): void {
    this.state.processedCommandIds.push(commandId);
    this.state.processedCommandIds = this.state.processedCommandIds.slice(
      -MAX_PROCESSED_COMMANDS,
    );
    this.state.revision += 1;
  }
}
