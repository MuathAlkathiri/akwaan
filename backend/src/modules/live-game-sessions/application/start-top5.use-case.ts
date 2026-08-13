import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  TOP5_ENTRY_COUNT,
  TOP5_VARIANT,
} from '../../world-content/domain/world-content.constants';
import { Top5Payload } from '../../world-content/domain/world-content.types';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { LiveSessionDomainError } from '../domain/live-session.errors';
import {
  TOP5_DECISION_ACTION,
  TOP5_MODE_KEY,
} from '../domain/top5-keep-or-give.plugin';
import {
  assignNextTeamAction,
  buildTeamRotations,
  createTeamActionAssignmentState,
  EligibleParticipant,
  serializeTeamActionAssignments,
} from '../domain/team-action-assignment';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import { StartTeamTurn, SwitchActiveTeam } from './live-session-turn.use-cases';
import { LiveGameSessionState } from '../domain/live-game-session';

/** Fisher–Yates over a crypto source; the one place Top 5 order is decided. */
function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Every connected team-player, as the assignment layer sees them. */
export function eligibleParticipantsOf(
  state: LiveGameSessionState,
): EligibleParticipant[] {
  return state.participants
    .filter(
      (participant) =>
        participant.role === 'team-player' &&
        !participant.removedAt &&
        Boolean(participant.teamId),
    )
    .map((participant) => ({
      participantId: participant.id,
      teamId: participant.teamId,
      connected: participant.connected,
    }));
}

@Injectable()
export class StartTop5 {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly items: ContentItemRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly getRuntime: GetGameplayRuntime,
    private readonly startTeamTurn: StartTeamTurn,
    private readonly switchActiveTeam: SwitchActiveTeam,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    boardConfigurationId?: string;
    challengeTypeId?: string;
    contentItemId: string;
    startingTeamId?: string;
  }) {
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'TOP5_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Top 5',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Top 5',
      );
    }
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'TOP5_REQUIRES_TWO_TEAMS',
        'Top 5 requires exactly two active teams',
      );
    }
    const startingTeamId = input.startingTeamId ?? teams[0];
    if (!teams.includes(startingTeamId)) {
      throw new LiveSessionDomainError(
        'TOP5_STARTING_TEAM_INVALID',
        'Starting team is not active',
      );
    }
    if (!sessionState.activeTeamId) {
      await this.startTeamTurn.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        commandId: randomUUID(),
        expectedRevision: session.revision,
        teamId: startingTeamId,
        reason: 'top5-start',
      });
    } else if (sessionState.activeTeamId !== startingTeamId) {
      await this.switchActiveTeam.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        commandId: randomUUID(),
        expectedRevision: session.revision,
        teamId: startingTeamId,
        reason: 'top5-start',
      });
    }
    const launchedSession =
      (await this.sessions.findById(input.sessionId)) ?? session;
    const item = await this.items.findById(input.contentItemId);
    if (
      !item ||
      item.status !== ContentItemStatus.READY ||
      String(item.worldId) !== input.worldId ||
      item.answerPayload.mode !== ChallengeAnswerMode.TOP_5
    ) {
      throw new LiveSessionDomainError(
        'TOP5_CONTENT_INVALID',
        'Select one ready Top 5 content item',
      );
    }
    const payload = item.mechanicPayload as Top5Payload | undefined;
    if (payload?.variant !== TOP5_VARIANT) {
      throw new LiveSessionDomainError(
        'TOP5_VARIANT_INVALID',
        'The selected content item is not authored for Top 5',
      );
    }
    if (
      Boolean(input.boardConfigurationId) === Boolean(input.challengeTypeId)
    ) {
      throw new LiveSessionDomainError(
        'TOP5_LAUNCH_TARGET_REQUIRED',
        'Provide one Top 5 board configuration or ChallengeType',
      );
    }
    const configuration = input.boardConfigurationId
      ? await this.configurations.findById(input.boardConfigurationId)
      : await this.configurations.findByWorldAndChallengeType(
          input.worldId,
          input.challengeTypeId!,
        );
    const mechanicId =
      input.challengeTypeId ?? String(configuration?.challengeTypeId ?? '');
    const mechanic = mechanicId
      ? await this.challengeTypes.findById(mechanicId)
      : null;
    if (
      !configuration ||
      String(configuration.worldId) !== input.worldId ||
      !configuration.isEnabled ||
      !mechanic ||
      mechanic.slug !== TOP5_MODE_KEY ||
      !item.compatibleChallengeTypeIds.some(
        (id) => String(id) === String(mechanic._id),
      )
    ) {
      throw new LiveSessionDomainError(
        'TOP5_MECHANIC_INCOMPATIBLE',
        'Select an enabled canonical Top 5 board configuration compatible with this content',
      );
    }
    const entries = payload.entries ?? [];
    if (entries.length !== TOP5_ENTRY_COUNT) {
      throw new LiveSessionDomainError(
        'TOP5_CONTENT_INVALID',
        `Top 5 content must hold exactly ${TOP5_ENTRY_COUNT} entries`,
      );
    }

    // Two independent server-owned orders, both fixed here and persisted, so a
    // refresh or a reconnect can never change what was already decided:
    // `deck` is the order the cards are played in, `revealOrder` is the order
    // ownership lights up on the result screen. The second is withheld from every
    // projection until the challenge resolves.
    const ids = entries.map((entry) => entry.id);
    const deck = shuffled(ids);
    const revealOrder = shuffled(ids);

    const participants = eligibleParticipantsOf(launchedSession.serialize());
    const rotations = buildTeamRotations({
      teams,
      participants,
      randomIndex: (exclusiveMax) => randomInt(exclusiveMax),
    });
    const opened = assignNextTeamAction(
      createTeamActionAssignmentState(rotations),
      {
        teamId: startingTeamId,
        action: TOP5_DECISION_ACTION,
        participants,
      },
    );

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      modeKey: TOP5_MODE_KEY,
      modeVersion: 1,
      initialState: {
        variant: TOP5_VARIANT,
        contentItemId: String(item._id),
        worldId: input.worldId,
        boardConfigurationId: String(configuration._id),
        title: payload.title,
        instruction: payload.instruction ?? '',
        rankingBasis: payload.rankingBasis,
        sourceLabel: payload.sourceLabel,
        asOfDate: payload.asOfDate ?? null,
        entriesJson: JSON.stringify(
          entries.map((entry) => ({
            id: entry.id,
            label: entry.label,
            ...(entry.shortLabel ? { shortLabel: entry.shortLabel } : {}),
            ...(entry.media ? { media: entry.media } : {}),
            rank: entry.rank ?? null,
          })),
        ),
        deckJson: JSON.stringify(deck),
        revealOrderJson: JSON.stringify(revealOrder),
        teamIdsJson: JSON.stringify(teams),
        ownershipJson: '[]',
        teamActionJson: serializeTeamActionAssignments(opened.state),
        startingTeamId,
        phase: 'deciding',
      },
    });
    let runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.startRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.createRound.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
      activeTeamId: startingTeamId,
      activeParticipantId: opened.assignment.participantId,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    const roundId = runtime.serialize().activeRound!.id;
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
