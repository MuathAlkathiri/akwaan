import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
} from '../../world-content/domain/world-content.constants';
import { Top10PoisonDeckPayload } from '../../world-content/domain/world-content.types';
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
  TOP10_MODE_KEY,
  TOP10_POISON_DECK_VARIANT,
} from '../domain/top10-poison-deck.plugin';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import { GameplayDeadlineScheduler } from './gameplay-deadline.scheduler';
import { StartTeamTurn, SwitchActiveTeam } from './live-session-turn.use-cases';

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

@Injectable()
export class StartTop10PoisonDeck {
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
    private readonly deadlines: GameplayDeadlineScheduler,
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
        'TOP10_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Top 10',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Top 10',
      );
    }
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'TOP10_REQUIRES_TWO_TEAMS',
        'Poison deck requires exactly two active teams',
      );
    }
    const startingTeamId = input.startingTeamId ?? teams[0];
    if (!teams.includes(startingTeamId)) {
      throw new LiveSessionDomainError(
        'TOP10_STARTING_TEAM_INVALID',
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
        reason: 'top10-poison-deck-start',
      });
    } else if (sessionState.activeTeamId !== startingTeamId) {
      await this.switchActiveTeam.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        commandId: randomUUID(),
        expectedRevision: session.revision,
        teamId: startingTeamId,
        reason: 'top10-poison-deck-start',
      });
    }
    const launchedSession =
      (await this.sessions.findById(input.sessionId)) ?? session;
    const item = await this.items.findById(input.contentItemId);
    if (
      !item ||
      item.status !== ContentItemStatus.READY ||
      String(item.worldId) !== input.worldId ||
      item.answerPayload.mode !== ChallengeAnswerMode.TOP_10
    ) {
      throw new LiveSessionDomainError(
        'TOP10_CONTENT_INVALID',
        'Select one ready Top 10 content item',
      );
    }
    const payload = item.mechanicPayload as Top10PoisonDeckPayload | undefined;
    if (payload?.variant !== TOP10_POISON_DECK_VARIANT) {
      throw new LiveSessionDomainError(
        'TOP10_VARIANT_INVALID',
        'The selected content item is not the poison-deck variant',
      );
    }
    if (
      Boolean(input.boardConfigurationId) === Boolean(input.challengeTypeId)
    ) {
      throw new LiveSessionDomainError(
        'TOP10_LAUNCH_TARGET_REQUIRED',
        'Provide one Top 10 board configuration or ChallengeType',
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
      mechanic.slug !== TOP10_MODE_KEY ||
      !item.compatibleChallengeTypeIds.some(
        (id) => String(id) === String(mechanic._id),
      )
    ) {
      throw new LiveSessionDomainError(
        'TOP10_MECHANIC_INCOMPATIBLE',
        'Select an enabled canonical Top 10 board configuration compatible with this content',
      );
    }

    const deck = shuffled(payload.candidates.map((candidate) => candidate.id));
    const revealOrder = [
      ...[...payload.rankedAnswer]
        .sort((left, right) => right.rank - left.rank)
        .map((answer) => answer.candidateId),
      ...payload.decoyCandidateIds,
    ];
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      modeKey: TOP10_MODE_KEY,
      modeVersion: 1,
      initialState: {
        variant: TOP10_POISON_DECK_VARIANT,
        contentItemId: String(item._id),
        worldId: input.worldId,
        boardConfigurationId: String(configuration._id),
        title: payload.title,
        instruction: payload.instruction ?? '',
        rankingBasis: payload.rankingBasis,
        sourceLabel: payload.sourceLabel,
        asOfDate: payload.asOfDate ?? null,
        candidatesJson: JSON.stringify(payload.candidates),
        deckJson: JSON.stringify(deck),
        rankedAnswerJson: JSON.stringify(payload.rankedAnswer),
        decoyCandidateIdsJson: JSON.stringify(payload.decoyCandidateIds),
        revealOrderJson: JSON.stringify(revealOrder),
        teamIdsJson: JSON.stringify(teams),
        assignmentsJson: '[]',
        startingTeamId,
        phase: 'assigning',
        revealIndex: 0,
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
    await this.deadlines.schedule(input.sessionId);
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
