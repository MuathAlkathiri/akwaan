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
  ONE_CLUE_ITEM_COUNT,
  ONE_CLUE_MODE_KEY,
  ONE_CLUE_STAGE_SECONDS,
  OneClueRuntimeItem,
  oneClueAnswerAction,
  validateOneClueItem,
} from '../domain/one-clue-gameplay.plugin';
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

@Injectable()
export class StartOneClueGameplay {
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
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    contentItemIds: string[];
  }) {
    if (
      input.contentItemIds.length !== ONE_CLUE_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== ONE_CLUE_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct One Clue items',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_LAUNCH_FORBIDDEN',
        'Only the session controller can launch One Clue',
      );
    }
    const sessionState = session.serialize();
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    const mechanic = configuration
      ? await this.challengeTypes.findById(
          String(configuration.challengeTypeId),
        )
      : null;
    if (!configuration || !mechanic || mechanic.slug !== ONE_CLUE_MODE_KEY) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_SLOT_INVALID',
        'The board slot must use the canonical One Clue mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const runtimeItems: OneClueRuntimeItem[] = documents.map((item) => {
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== input.worldId ||
        item.answerPayload.mode !== ChallengeAnswerMode.MATCH ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      ) {
        throw new LiveSessionDomainError(
          'ONE_CLUE_CONTENT_INVALID',
          'Every item must be ready, compatible, and use accepted answers',
        );
      }
      const clues = (item.mechanicPayload?.clues ??
        []) as OneClueRuntimeItem['clues'];
      const runtimeItem = {
        id: String(item._id),
        prompt: item.prompt,
        media: item.media ?? null,
        clues,
        acceptedAnswers: item.answerPayload.acceptedAnswers,
      };
      validateOneClueItem(runtimeItem);
      return runtimeItem;
    });
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_REQUIRES_TWO_TEAMS',
        'One Clue requires exactly two active teams',
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
        action: oneClueAnswerAction(teamId),
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
      modeKey: ONE_CLUE_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        itemsJson: JSON.stringify(runtimeItems),
        teamIdsJson: JSON.stringify(teams),
        currentItemIndex: 0,
        currentClueIndex: 0,
        phase: 'collecting',
        submissionsJson: '{}',
        lockedAnswersJson: '{}',
        eliminatedTeamIdsJson: '[]',
        resultsJson: '[]',
        teamActionJson: serializeTeamActionAssignments(assignments),
        deadlineAt: new Date(
          now.getTime() + ONE_CLUE_STAGE_SECONDS * 1000,
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
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId: runtime.serialize().activeRound!.id,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
