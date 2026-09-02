import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  FIRST_NOTE_ANSWER_SECONDS,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { FirstNotePayload } from '../../world-content/domain/world-content.types';
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
  FIRST_NOTE_ITEM_COUNT,
  FIRST_NOTE_MODE_KEY,
  FirstNoteRuntimeSong,
  validateFirstNoteSong,
} from '../domain/first-note-gameplay.plugin';
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
export class StartFirstNoteGameplay {
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
      input.contentItemIds.length !== FIRST_NOTE_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== FIRST_NOTE_ITEM_COUNT
    )
      throw new LiveSessionDomainError(
        'FIRST_NOTE_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct songs',
      );
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId)
      throw new LiveSessionDomainError(
        'FIRST_NOTE_LAUNCH_FORBIDDEN',
        'Only the controller can launch First Note',
      );
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    const mechanic = configuration
      ? await this.challengeTypes.findById(
          String(configuration.challengeTypeId),
        )
      : null;
    if (!configuration || !mechanic || mechanic.slug !== FIRST_NOTE_MODE_KEY)
      throw new LiveSessionDomainError(
        'FIRST_NOTE_SLOT_INVALID',
        'The slot must use First Note',
      );
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const songs: FirstNoteRuntimeSong[] = documents.map((item) => {
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== input.worldId ||
        item.answerPayload.mode !== ChallengeAnswerMode.MATCH ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      )
        throw new LiveSessionDomainError(
          'FIRST_NOTE_CONTENT_INVALID',
          'Every song must be ready and compatible',
        );
      const payload = item.mechanicPayload as
        Partial<FirstNotePayload> | undefined;
      return validateFirstNoteSong({
        contentItemId: String(item._id),
        title: item.answerPayload.acceptedAnswers[0] ?? '',
        acceptedAnswers: item.answerPayload.acceptedAnswers,
        contextualClue: payload?.contextualClue ?? { ar: '' },
        clueLabel: payload?.clueLabel ?? null,
        audio: item.media!,
      });
    });
    const teams = session
      .serialize()
      .teams.filter((t) => t.active)
      .map((t) => t.id);
    if (teams.length !== 2)
      throw new LiveSessionDomainError(
        'FIRST_NOTE_REQUIRES_TWO_TEAMS',
        'First Note requires two teams',
      );
    const configuredSeconds = Number(mechanic.defaultPresentation.timerSeconds);
    const answerWindowSeconds =
      Number.isFinite(configuredSeconds) && configuredSeconds > 0
        ? configuredSeconds
        : FIRST_NOTE_ANSWER_SECONDS;
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: FIRST_NOTE_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        songsJson: JSON.stringify(songs),
        teamIdsJson: JSON.stringify(teams),
        currentSongIndex: 0,
        phase: 'preparing',
        biddingTeamId: teams[0],
        currentBidSeconds: null,
        currentBidTeamId: null,
        answerOwnerTeamId: null,
        finalBidSeconds: null,
        bidHistoryJson: '[]',
        resultsJson: '[]',
        deadlineAt: null,
        answerWindowSeconds,
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
