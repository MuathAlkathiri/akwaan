import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  buildBombRuntimeItems,
  type BombAuthoredItem,
} from '../../world-content/domain/bomb-content.policy';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { LiveSessionDomainError } from '../domain/live-session.errors';
import { BOMB_MODE_KEY } from '../domain/bomb-gameplay.plugin';
import {
  findEligibleTeamParticipant,
  type TeamParticipantEligibilityCandidate,
} from '../domain/team-participant-eligibility';

export function resolveUnifiedBombRepresentative<
  T extends TeamParticipantEligibilityCandidate,
>(participants: readonly T[], teamId: string): T | undefined {
  return findEligibleTeamParticipant(participants, {
    teamId,
    requiresConnectedPresence: true,
  });
}
import { StartTeamTurn } from './live-session-turn.use-cases';
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
 * The canonical Akwaan way to start "القنبلة".
 *
 * Bomb already had a start path, but it reached into the legacy Game/Question
 * model. This one takes an ordered selection of ContentItems instead, so the
 * mechanic sits in World → Scope → ChallengeType → ContentItem like every other
 * one. The legacy path is left alone: it still serves existing Bomb questions.
 *
 * The adapter boundary is deliberate. `buildBombRuntimeItems` turns
 * ContentItems into the `{imageUrl, altText, acceptedAnswers}` shape the Bomb
 * plugin already expects, so the domain plugin never learns that ContentItems
 * exist and needs no change to be playable from a board.
 *
 * Team clocks are not allocated here. The live session mode allocates them when
 * the session is created; Bomb only starts the active team's turn, which is
 * what sets that clock running and gives the deadline scheduler something to
 * watch.
 */
@Injectable()
export class StartBombGameplayFromContent {
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
    private readonly startTurn: StartTeamTurn,
    private readonly getRuntime: GetGameplayRuntime,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    contentItemIds: string[];
  }) {
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'BOMB_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Bomb',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Bomb',
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
    if (!configuration || !mechanic || mechanic.slug !== BOMB_MODE_KEY) {
      throw new LiveSessionDomainError(
        'BOMB_SLOT_INVALID',
        'The selected board slot must use the canonical Bomb mechanic',
      );
    }

    // Fetched in the caller's order: the selection order *is* gameplay order.
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const authored: BombAuthoredItem[] = documents.map((item, index) => {
      if (
        !item ||
        String(item.worldId) !== input.worldId ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      ) {
        throw new LiveSessionDomainError(
          'BOMB_CONTENT_INVALID',
          `Bomb item ${index + 1} is missing, from another World, or not compatible with this mechanic`,
        );
      }
      return {
        id: String(item._id),
        status: item.status,
        prompt: item.prompt as BombAuthoredItem['prompt'],
        media: item.media as BombAuthoredItem['media'],
        answerPayload: item.answerPayload as BombAuthoredItem['answerPayload'],
      };
    });

    // Cardinality, media, answers and normalization all live in one policy, so
    // the board and the admin reject the same content for the same reasons.
    const runtimeItems = buildBombRuntimeItems(authored);

    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'BOMB_REQUIRES_TWO_TEAMS',
        'Bomb requires exactly two active teams',
      );
    }

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: BOMB_MODE_KEY,
      modeVersion: 1,
      initialState: {
        phase: 'ready',
        questionIndex: 0,
        // One Bomb "question" holding the whole ordered run, which is the shape
        // the plugin already reads. Each item carries its own prompt; the
        // question-level one exists only as the legacy fallback.
        questionsJson: JSON.stringify([
          {
            id: randomUUID(),
            prompt: runtimeItems[0].prompt,
            items: runtimeItems,
          },
        ]),
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
    const representative = resolveUnifiedBombRepresentative(
      sessionState.participants,
      teams[0],
    );
    if (!representative) {
      throw new LiveSessionDomainError(
        'BOMB_REPRESENTATIVE_REQUIRED',
        'The active Bomb team requires a connected representative',
      );
    }
    await this.createRound.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      activeTeamId: teams[0],
      activeParticipantId: representative.id,
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

    // Starts the first team's clock. Until a clock is running there is no
    // deadline for the scheduler to arm, so this has to precede scheduling.
    const current = await this.sessions.findById(input.sessionId);
    if (current && !current.serialize().activeTeamId) {
      await this.startTurn.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        teamId: teams[0],
        expectedRevision: current.revision,
        commandId: randomUUID(),
        reason: 'bomb-round-start',
      });
    }

    return this.getRuntime.execute(input.sessionId, actor);
  }
}
