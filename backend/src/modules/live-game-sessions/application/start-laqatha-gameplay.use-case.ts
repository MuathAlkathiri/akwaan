import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { LaqathaPayload } from '../../world-content/domain/world-content.types';
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
  LAQATHA_ITEM_COUNT,
  LAQATHA_MODE_KEY,
  LaqathaRuntimeQuestion,
  validateLaqathaQuestion,
} from '../domain/laqatha-gameplay.plugin';
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
export class StartLaqathaGameplay {
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
      input.contentItemIds.length !== LAQATHA_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== LAQATHA_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'LAQATHA_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct القطها movie questions',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'LAQATHA_LAUNCH_FORBIDDEN',
        'Only the session controller can launch القطها',
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
    if (!configuration || !mechanic || mechanic.slug !== LAQATHA_MODE_KEY) {
      throw new LiveSessionDomainError(
        'LAQATHA_SLOT_INVALID',
        'The board slot must use the canonical القطها mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const runtimeQuestions: LaqathaRuntimeQuestion[] = documents.map((item) => {
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
          'LAQATHA_CONTENT_INVALID',
          'Every item must be ready, compatible, and use accepted answers',
        );
      }
      const payload = item.mechanicPayload as
        Partial<LaqathaPayload> | undefined;
      const clues = (payload?.clues ?? []).map((clue) => ({
        order: clue.order,
        value: clue.value,
        text: clue.text ?? null,
        media: clue.media ?? null,
      }));
      const acceptedAnswers = item.answerPayload.acceptedAnswers;
      const question: LaqathaRuntimeQuestion = {
        contentItemId: String(item._id),
        // The canonical movie title is the first accepted answer — the single
        // source of truth for what is correct — surfaced only at the reveal.
        title: acceptedAnswers[0] ?? '',
        prompt: item.prompt ?? null,
        clues,
        acceptedAnswers,
      };
      validateLaqathaQuestion(question);
      return question;
    });
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'LAQATHA_REQUIRES_TWO_TEAMS',
        'القطها requires exactly two active teams',
      );
    }
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: LAQATHA_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        questionsJson: JSON.stringify(runtimeQuestions),
        teamIdsJson: JSON.stringify(teams),
        currentQuestionIndex: 0,
        revealedClueCount: 1,
        phase: 'preparing',
        claimOwnerTeamId: null,
        frozenReward: null,
        revealRemainingMs: null,
        failedTeamIdsJson: '[]',
        resultsJson: '[]',
        // Set on Fair-Start activation; no clue clock runs before then.
        deadlineAt: null,
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
