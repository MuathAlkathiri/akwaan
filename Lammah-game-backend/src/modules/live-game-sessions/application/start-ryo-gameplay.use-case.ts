import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { LiveSessionDomainError } from '../domain/live-session.errors';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import { GameplayInteractionUseCases } from './gameplay-interaction.use-cases';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import { Inject } from '@nestjs/common';
import {
  openRyoItemAssignments,
  RYO_MODE_KEY,
} from '../domain/ryo-gameplay.plugin';
import {
  buildTeamRotations,
  createTeamActionAssignmentState,
  serializeTeamActionAssignments,
} from '../domain/team-action-assignment';
import { eligibleParticipantsOf } from './start-top5.use-case';
import { randomInt } from 'crypto';

/**
 * The authored answer contract as a plain object.
 *
 * What the repository hands back is a Mongoose subdocument, whose enumerable own
 * properties are its internals rather than its fields — so spreading one yields
 * `$__`, `$__parent` and friends, and silently drops `options` and
 * `correctOptionId`. Everything downstream of the runtime item reads those two.
 */
export function plainAnswerPayload(payload: unknown): Record<string, unknown> {
  const candidate = payload as { toObject?: () => Record<string, unknown> };
  const plain =
    typeof candidate?.toObject === 'function'
      ? candidate.toObject()
      : (payload as Record<string, unknown>);
  const fields = { ...(plain ?? {}) };
  // Mongoose keeps `_id` on subdocuments; it is not part of the answer contract
  // and must not travel into a runtime payload.
  delete fields._id;
  return fields;
}

@Injectable()
export class StartRyoGameplay {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly items: ContentItemRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly interactions: GameplayInteractionUseCases,
    private readonly getRuntime: GetGameplayRuntime,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    contentItemIds: string[];
    startingTeamId?: string;
  }) {
    if (
      input.contentItemIds.length !== 3 ||
      new Set(input.contentItemIds).size !== 3
    )
      throw new LiveSessionDomainError(
        'RYO_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct ContentItems',
      );
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId)
      throw new LiveSessionDomainError(
        'RYO_LAUNCH_FORBIDDEN',
        'Only the session controller can launch RYO',
      );
    const sessionState = session.serialize();
    if (sessionState.status !== 'active')
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching RYO',
      );
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    if (!configuration)
      throw new LiveSessionDomainError(
        'RYO_SLOT_NOT_CONFIGURED',
        'The selected board slot is not configured',
      );
    const mechanic = await this.challengeTypes.findById(
      String(configuration.challengeTypeId),
    );
    if (!mechanic || mechanic.slug !== RYO_MODE_KEY)
      throw new LiveSessionDomainError(
        'RYO_SLOT_INVALID',
        'The selected slot must use the Read Your Opponent mechanic',
      );
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    for (const item of documents) {
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== input.worldId ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        ) ||
        ![
          ChallengeAnswerMode.MULTIPLE_CHOICE,
          ChallengeAnswerMode.CLOSEST,
        ].includes(item.answerPayload.mode)
      )
        throw new LiveSessionDomainError(
          'RYO_CONTENT_INVALID',
          'Every item must be ready, compatible, in the World, and machine-checkable',
        );
    }
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2)
      throw new LiveSessionDomainError(
        'RYO_REQUIRES_TWO_TEAMS',
        'RYO requires exactly two active teams',
      );
    const startingTeamId = input.startingTeamId ?? teams[0];
    if (!teams.includes(startingTeamId))
      throw new LiveSessionDomainError(
        'RYO_STARTING_TEAM_INVALID',
        'Starting team is not active',
      );
    const opposingTeamId = teams.find((id) => id !== startingTeamId)!;
    // One authoritative answerer and one authoritative Trust/Steal decider per
    // item, from a rotation randomised once and then persisted. The two actions
    // stay blind and simultaneous; only who may take them is now decided.
    const participants = eligibleParticipantsOf(sessionState);
    const opened = openRyoItemAssignments({
      state: createTeamActionAssignmentState(
        buildTeamRotations({
          teams,
          participants,
          randomIndex: (exclusiveMax) => randomInt(exclusiveMax),
        }),
      ),
      answeringTeamId: startingTeamId,
      opposingTeamId,
      participants,
    });
    const actor = { kind: 'user' as const, actorId: input.actorId };
    const runtimeItems = documents.map((item, itemIndex) => ({
      id: String(item!._id),
      itemIndex,
      prompt: item!.prompt,
      media: item!.media ?? null,
      answerMode: item!.answerPayload.mode,
      // `answerPayload` is a Mongoose subdocument, and spreading one copies its
      // internals instead of its fields: `options` and `correctOptionId` never
      // reached the runtime, so the answering phone was offered an empty choice
      // list and every answer graded as wrong. Take the plain object.
      ...plainAnswerPayload(item!.answerPayload),
    }));
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: RYO_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        itemsJson: JSON.stringify(runtimeItems),
        teamIdsJson: JSON.stringify(teams),
        currentItemIndex: 0,
        startingTeamId,
        teamActionJson: serializeTeamActionAssignments(opened.state),
        phase: 'intro',
        scoreEventsJson: '[]',
        resultsJson: '[]',
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
      activeTeamId: startingTeamId,
      activeParticipantId: opened.answererParticipantId,
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
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.interactions.prepare({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      payload: {
        itemJson: JSON.stringify(runtimeItems[0]),
        opposingTeamId,
        answererParticipantId: opened.answererParticipantId,
        deciderParticipantId: opened.deciderParticipantId,
      },
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.interactions.open({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      expectedInteractionRevision:
        runtime.serialize().activeRound!.interaction!.revision,
    });
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
