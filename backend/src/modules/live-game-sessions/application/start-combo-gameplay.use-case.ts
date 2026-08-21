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
import {
  COMBO_ITEM_COUNT,
  ComboCandidateItem,
  buildComboQuestionPlan,
} from '../../world-content/domain/combo-content.policy';
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
  COMBO_MODE_KEY,
  COMBO_QUESTION_SECONDS,
} from '../domain/combo-gameplay.plugin';
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
 * Launch "الكومبو" for one board slot.
 *
 * The whole eight-question plan — both Runs, all four stages — is built and
 * persisted here, before the first clock starts. That is deliberate: the plan has
 * to survive reconnect, refresh, duplicate delivery and process restart, and the
 * server has to know whether a further question exists because كسر الكومبو is
 * only legal while one does. Fetching a fresh question after each answer would
 * make both of those impossible.
 */
@Injectable()
export class StartComboGameplay {
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
      input.contentItemIds.length !== COMBO_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== COMBO_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'COMBO_REQUIRES_EIGHT_ITEMS',
        `Select exactly ${COMBO_ITEM_COUNT} distinct Combo items`,
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'COMBO_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Combo',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Combo',
      );
    }
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    const mechanic = configuration
      ? await this.challengeTypes.findById(
          String(configuration.challengeTypeId),
        )
      : null;
    if (!configuration || !mechanic || mechanic.slug !== COMBO_MODE_KEY) {
      throw new LiveSessionDomainError(
        'COMBO_SLOT_INVALID',
        'The selected board slot must use the canonical Combo mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const candidates: ComboCandidateItem[] = documents.map((item, index) => {
      if (
        !item ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      ) {
        throw new LiveSessionDomainError(
          'COMBO_CONTENT_INVALID',
          `Combo item ${index + 1} must exist and be compatible with the Combo mechanic`,
        );
      }
      const payload = item.answerPayload as {
        mode?: ChallengeAnswerMode;
        acceptedAnswers?: string[];
      };
      return {
        id: String(item._id),
        status: item.status as ContentItemStatus,
        worldId: String(item.worldId),
        scopeId: String(item.scopeId),
        prompt: item.prompt,
        answerMode: payload.mode,
        acceptedAnswers: payload.acceptedAnswers,
        mechanicPayload: item.mechanicPayload,
      };
    });
    // Stage coverage, answer contract and Scope spread are all decided by the
    // one policy that owns Combo's content shape.
    const plan = buildComboQuestionPlan(candidates, { worldId: input.worldId });
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'COMBO_REQUIRES_TWO_TEAMS',
        'Combo requires exactly two active teams',
      );
    }
    const actor = { kind: 'user' as const, actorId: input.actorId };
    const now = new Date();
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: COMBO_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        teamIdsJson: JSON.stringify(teams),
        questionPlanJson: JSON.stringify(plan),
        runResultsJson: '[]',
        chargesJson: JSON.stringify(
          Object.fromEntries(teams.map((teamId) => [teamId, 'available'])),
        ),
        runIndex: 0,
        questionIndex: 0,
        unbankedPoints: 0,
        phase: 'question',
        forcedQuestion: false,
        armedBreakByTeamId: null,
        deadlineAt: new Date(
          now.getTime() + COMBO_QUESTION_SECONDS * 1000,
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
    return this.getRuntime.execute(input.sessionId, actor);
  }
}
