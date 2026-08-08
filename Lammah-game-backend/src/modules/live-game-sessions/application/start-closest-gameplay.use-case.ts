import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
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
  CLOSEST_ITEM_COUNT,
  CLOSEST_MODE_KEY,
  CLOSEST_TIMER_SECONDS,
  closestAnswerAction,
} from '../domain/closest-gameplay.plugin';
import {
  assignNextTeamAction,
  buildTeamRotations,
  createTeamActionAssignmentState,
  serializeTeamActionAssignments,
} from '../domain/team-action-assignment';
import { eligibleParticipantsOf } from './start-top5.use-case';
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

@Injectable()
export class StartClosestGameplay {
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
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    contentItemIds: string[];
  }) {
    if (
      input.contentItemIds.length !== CLOSEST_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== CLOSEST_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'CLOSEST_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct Closest items',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'CLOSEST_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Closest',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Closest',
      );
    }
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    const mechanic = configuration
      ? await this.challengeTypes.findById(String(configuration.challengeTypeId))
      : null;
    if (!configuration || !mechanic || mechanic.slug !== CLOSEST_MODE_KEY) {
      throw new LiveSessionDomainError(
        'CLOSEST_SLOT_INVALID',
        'The selected board slot must use the canonical Closest mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    for (const item of documents) {
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== input.worldId ||
        item.answerPayload.mode !== ChallengeAnswerMode.CLOSEST ||
        !Number.isFinite(item.answerPayload.correctValue) ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      ) {
        throw new LiveSessionDomainError(
          'CLOSEST_CONTENT_INVALID',
          'Every Closest item must be ready, compatible, and have a finite correct value',
        );
      }
    }
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'CLOSEST_REQUIRES_TWO_TEAMS',
        'Closest requires exactly two active teams',
      );
    }
    const participants = eligibleParticipantsOf(sessionState);
    let assignments = createTeamActionAssignmentState(
      buildTeamRotations({
        teams,
        participants,
        randomIndex: (exclusiveMax) => randomInt(exclusiveMax),
      }),
    );
    for (const teamId of teams) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: closestAnswerAction(teamId),
        participants,
      }).state;
    }
    const actor = { kind: 'user' as const, actorId: input.actorId };
    const now = new Date();
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: CLOSEST_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        itemsJson: JSON.stringify(
          documents.map((item) => ({
            id: String(item!._id),
            prompt: item!.prompt,
            media: item!.media ?? null,
            correctValue: (item!.answerPayload as {
              mode: ChallengeAnswerMode.CLOSEST;
              correctValue: number;
            }).correctValue,
          })),
        ),
        teamIdsJson: JSON.stringify(teams),
        currentItemIndex: 0,
        phase: 'collecting',
        answersJson: '{}',
        resultsJson: '[]',
        teamActionJson: serializeTeamActionAssignments(assignments),
        deadlineAt: new Date(
          now.getTime() + CLOSEST_TIMER_SECONDS * 1000,
        ).toISOString(),
      },
    });
    let runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.startRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.createRound.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      activeTeamId: teams[0],
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    const roundId = runtime.serialize().activeRound!.id;
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    await this.deadlines.schedule(input.sessionId);
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
