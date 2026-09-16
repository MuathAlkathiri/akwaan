import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ContentItemStatus,
  LA_TAHRIQHA_DEFAULT_DISH_SECONDS,
  LA_TAHRIQHA_DISH_COUNT,
  LA_TAHRIQHA_SLUG,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { validateLaTahriqhaPayload } from '../../world-content/domain/la-tahriqha-content.policy';
import { LaTahriqhaPayload } from '../../world-content/domain/world-content.types';
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
  LA_TAHRIQHA_MODE_KEY,
  LaTahriqhaRuntimeDish,
  LaTahriqhaRuntimeIngredient,
  laTahriqhaDishAction,
} from '../domain/la-tahriqha-gameplay.plugin';
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

/**
 * Presentation order for one dish's eight cards.
 *
 * Authoring lists the five correct ingredients and then the three distractors,
 * which would hand the room the answer in the first second if it reached a
 * screen in that order. Shuffled once, here, and persisted with the runtime — so
 * the order is the same on the shared screen, on every phone, after a reconnect
 * and in the reveal, rather than being re-rolled on each read.
 */
function shuffled<T>(items: readonly T[]): T[] {
  const deck = [...items];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

@Injectable()
export class StartLaTahriqhaGameplay {
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
      input.contentItemIds.length !== LA_TAHRIQHA_DISH_COUNT ||
      new Set(input.contentItemIds).size !== LA_TAHRIQHA_DISH_COUNT
    ) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_REQUIRES_THREE_DISHES',
        'Select exactly three distinct لا تحرقها dishes',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_LAUNCH_FORBIDDEN',
        'Only the session controller can launch لا تحرقها',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching لا تحرقها',
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
    if (!configuration || !mechanic || mechanic.slug !== LA_TAHRIQHA_SLUG) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_SLOT_INVALID',
        'The selected board slot must use the canonical لا تحرقها mechanic',
      );
    }
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const dishes: LaTahriqhaRuntimeDish[] = documents.map((item) => {
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== input.worldId ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      ) {
        throw new LiveSessionDomainError(
          'LA_TAHRIQHA_CONTENT_INVALID',
          'Every لا تحرقها dish must be ready, in this World, and compatible with the mechanic',
        );
      }
      const payload = item.mechanicPayload as
        Partial<LaTahriqhaPayload> | undefined;
      // The very predicate the Admin ran when the dish was saved, so a dish the
      // producer was told was ready cannot be refused here on game night.
      const problems = validateLaTahriqhaPayload(payload);
      if (problems.length) {
        throw new LiveSessionDomainError(
          'LA_TAHRIQHA_CONTENT_INVALID',
          problems[0].message,
        );
      }
      const authored = payload as LaTahriqhaPayload;
      const ingredients: LaTahriqhaRuntimeIngredient[] = shuffled(
        authored.ingredients,
      ).map((ingredient) => ({
        localId: ingredient.localId.trim(),
        label: ingredient.label.ar.trim(),
        correct: ingredient.correct,
      }));
      return {
        id: String(item._id),
        dishName: authored.dishName.ar.trim(),
        ...(authored.dishNote?.ar?.trim()
          ? { dishNote: authored.dishNote.ar.trim() }
          : {}),
        media: item.media ?? null,
        ingredients,
        timerSeconds: authored.timerSeconds ?? LA_TAHRIQHA_DEFAULT_DISH_SECONDS,
      };
    });

    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'LA_TAHRIQHA_REQUIRES_TWO_TEAMS',
        'لا تحرقها requires exactly two active teams',
      );
    }
    const participants = eligibleParticipantsOf(sessionState);
    /**
     * The rotation is the team's whole roster, in join order.
     *
     * Deliberately built from every team-player rather than from whoever is
     * connected at this instant: a phone that joined and was still opening its
     * socket when the host pressed start would otherwise be left out of the
     * order permanently, and over three dishes that means a player who is
     * present all evening and never once holds قائد الطبق. A real four-phone
     * Chromium run produced exactly that — one side's rotation persisted with a
     * single name in it. Connectivity still decides who may *act*: the
     * assignment below walks this order and skips anyone currently away, so a
     * disconnected captain hands over without losing their place.
     */
    const roster = participants.map((participant) => ({
      ...participant,
      connected: true,
    }));
    /**
     * And it starts at the top of that order rather than at a random position.
     *
     * Three dishes is short enough that a random start is visible as unfairness:
     * with three players and a cursor starting at 2, one player would captain
     * once and another never. Starting at zero gives A → B → C for three,
     * A → B → A for two, and the same player each time for one, which is the
     * rotation Product approved and the one a room can predict out loud.
     */
    let assignments = createTeamActionAssignmentState(
      buildTeamRotations({
        teams,
        participants: roster,
        randomIndex: () => 0,
      }),
    );
    for (const teamId of teams) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: laTahriqhaDishAction(teamId),
        participants,
      }).state;
    }

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: LA_TAHRIQHA_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        dishesJson: JSON.stringify(dishes),
        teamIdsJson: JSON.stringify(teams),
        currentDishIndex: 0,
        // Prepared, never open: the first dish carries no clock until the room's
        // screen has acknowledged it, so the authored window is the window the
        // teams actually get.
        phase: 'preparing',
        deadlineAt: null,
        selectionsJson: JSON.stringify(
          Object.fromEntries(teams.map((teamId) => [teamId, []])),
        ),
        lockedJson: JSON.stringify(
          Object.fromEntries(teams.map((teamId) => [teamId, false])),
        ),
        resultsJson: '[]',
        teamActionJson: serializeTeamActionAssignments(assignments),
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
