import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ChallengeAnswerMode,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import {
  ODD_PIECE_ITEM_COUNT,
  OddPieceCandidateItem,
  buildOddPiecePlan,
} from '../../world-content/domain/odd-piece-content.policy';
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
  ODD_PIECE_DEFAULT_OPEN_SECONDS,
  ODD_PIECE_MODE_KEY,
} from '../domain/odd-piece-gameplay.plugin';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';

const shuffle = <T>(values: T[]): T[] => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    [values[index], values[swapWith]] = [values[swapWith], values[index]];
  }
  return values;
};

/** Build and persist one complete three-puzzle Cars Signature runtime. */
@Injectable()
export class StartOddPieceGameplay {
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
      input.contentItemIds.length !== ODD_PIECE_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== ODD_PIECE_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'ODD_PIECE_REQUIRES_THREE_ITEMS',
        `Select exactly ${ODD_PIECE_ITEM_COUNT} distinct Odd Piece puzzles`,
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId)
      throw new LiveSessionDomainError(
        'ODD_PIECE_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Odd Piece',
      );
    const sessionState = session.serialize();
    if (sessionState.status !== 'active')
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Odd Piece',
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
    if (!configuration || !mechanic || mechanic.slug !== ODD_PIECE_MODE_KEY)
      throw new LiveSessionDomainError(
        'ODD_PIECE_SLOT_INVALID',
        'The selected board slot must use the canonical Odd Piece mechanic',
      );
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    const candidates: OddPieceCandidateItem[] = documents.map((item, index) => {
      if (
        !item ||
        item.answerPayload?.mode !== ChallengeAnswerMode.ODD_PIECE ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === String(mechanic._id),
        )
      )
        throw new LiveSessionDomainError(
          'ODD_PIECE_CONTENT_INVALID',
          `Odd Piece puzzle ${index + 1} must exist and be compatible`,
        );
      return {
        id: String(item._id),
        status: item.status,
        worldId: String(item.worldId),
        scopeId: String(item.scopeId),
        prompt: item.prompt,
        mechanicPayload: item.mechanicPayload,
      };
    });
    const plan = buildOddPiecePlan(candidates, {
      worldId: input.worldId,
      shuffle,
    });
    const teams = sessionState.teams
      .filter((team) => team.active)
      .map((team) => team.id);
    if (teams.length !== 2)
      throw new LiveSessionDomainError(
        'ODD_PIECE_REQUIRES_TWO_TEAMS',
        'Odd Piece requires exactly two active teams',
      );
    const configuredSeconds = Number(mechanic.defaultPresentation.timerSeconds);
    const openSeconds =
      Number.isFinite(configuredSeconds) && configuredSeconds > 0
        ? configuredSeconds
        : ODD_PIECE_DEFAULT_OPEN_SECONDS;
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: ODD_PIECE_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        teamIdsJson: JSON.stringify(teams),
        puzzlesJson: JSON.stringify(
          plan.map((puzzle) => ({
            id: puzzle.contentItemId,
            prompt: puzzle.prompt,
            pieces: puzzle.pieces,
            targetVehicleIdentity: puzzle.targetVehicleIdentity,
            targetVehicleLabel: puzzle.targetVehicleLabel,
            targetReveal: puzzle.targetReveal,
          })),
        ),
        currentPuzzleIndex: 0,
        attemptsJson: '[]',
        failedTeamIdsJson: '[]',
        resultsJson: '[]',
        answerOwnerTeamId: null,
        phase: 'preparing',
        deadlineAt: null,
        openSeconds,
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
