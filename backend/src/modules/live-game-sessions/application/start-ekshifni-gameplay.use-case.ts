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
import { EkshifniPayload } from '../../world-content/domain/world-content.types';
import { validateEkshifniPayload } from '../../world-content/domain/ekshifni-content.policy';
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
  EKSHIFNI_ITEM_COUNT,
  EKSHIFNI_MODE_KEY,
  EkshifniRuntimeImage,
  ekshifniOpeningTeam,
  validateEkshifniImage,
} from '../domain/ekshifni-gameplay.plugin';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';

/**
 * Compose three authored celebrities into one "اكشفني" runtime.
 *
 * The runtime carries the pictures, the six masks per picture, and the accepted
 * answers, because grading is the server's job; what a client is ever told is
 * decided later, by the plugin's projection. Nothing here starts a clock — the
 * first image opens in `preparing` and Fair-Start activation is what puts it on
 * screen.
 */
@Injectable()
export class StartEkshifniGameplay {
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
    /** The team that selected this challenge; it opens images 1 and 3. */
    startingTeamId?: string;
  }) {
    if (
      input.contentItemIds.length !== EKSHIFNI_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== EKSHIFNI_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'EKSHIFNI_REQUIRES_THREE_ITEMS',
        'Select exactly three distinct اكشفني celebrities',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'EKSHIFNI_LAUNCH_FORBIDDEN',
        'Only the session controller can launch اكشفني',
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
    if (!configuration || !mechanic || mechanic.slug !== EKSHIFNI_MODE_KEY) {
      throw new LiveSessionDomainError(
        'EKSHIFNI_SLOT_INVALID',
        'The board slot must use the canonical اكشفني mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const images: EkshifniRuntimeImage[] = documents.map((item) => {
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
          'EKSHIFNI_CONTENT_INVALID',
          'Every celebrity must be ready, compatible, and use accepted answers',
        );
      }
      const payload = item.mechanicPayload as Partial<EkshifniPayload>;
      // The very predicate the Admin ran, re-run here: authoring and launch
      // cannot disagree about what a valid اكشفني item is.
      const problems = validateEkshifniPayload(payload);
      if (problems.length) {
        throw new LiveSessionDomainError(
          'EKSHIFNI_CONTENT_INVALID',
          problems[0].message,
        );
      }
      const acceptedAnswers = item.answerPayload.acceptedAnswers;
      const image: EkshifniRuntimeImage = {
        contentItemId: String(item._id),
        // The canonical celebrity name is the first accepted answer — the single
        // source of truth for what is correct — surfaced only at the reveal.
        identity: acceptedAnswers[0] ?? '',
        prompt: item.prompt ?? null,
        media: item.media!,
        acceptedAnswers,
        regions: (payload.regions ?? []).map((region) => ({
          id: region.localId,
          role: region.role,
          shape: region.shape,
        })),
      };
      validateEkshifniImage(image);
      return image;
    });
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'EKSHIFNI_REQUIRES_TWO_TEAMS',
        'اكشفني requires exactly two active teams',
      );
    }
    const selectingTeamId = input.startingTeamId ?? teams[0];
    if (!teams.includes(selectingTeamId)) {
      throw new LiveSessionDomainError(
        'EKSHIFNI_STARTING_TEAM_INVALID',
        'The selecting team must be an active team in this session',
      );
    }
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: EKSHIFNI_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        imagesJson: JSON.stringify(images),
        teamIdsJson: JSON.stringify(teams),
        selectingTeamId,
        currentImageIndex: 0,
        phase: 'preparing',
        revealedRegionIdsJson: '[]',
        attemptsJson: '[]',
        resultsJson: '[]',
        // A → B → A across the three images; within an image this moves only
        // when a wrong answer moves it.
        initiativeTeamId: ekshifniOpeningTeam(teams, selectingTeamId, 0),
        answerPenaltyTeamId: null,
        // Set on Fair-Start activation; no clock runs before the picture is up.
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
      activeTeamId: selectingTeamId,
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
