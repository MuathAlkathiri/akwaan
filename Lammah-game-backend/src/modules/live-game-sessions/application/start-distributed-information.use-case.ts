import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ContentItemStatus,
  DISTRIBUTED_INFORMATION_ANSWER_MODES,
  DISTRIBUTED_INFORMATION_ITEM_COUNT,
  DISTRIBUTED_INFORMATION_TIMER_SECONDS,
  DISTRIBUTED_INFORMATION_VARIANT,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { DistributedInformationPayload } from '../../world-content/domain/world-content.types';
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
  DISTRIBUTED_INFORMATION_MODE_KEY,
  DistributedAssignment,
  DistributedPuzzle,
  DistributedTeamPlan,
} from '../domain/distributed-information.plugin';
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

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * Starts a "ركّبها" race.
 *
 * Every random choice — each team's puzzle order, who answers which puzzle, and
 * who holds which segments — is made here, once, and persisted in the runtime.
 * Nothing is recomputed on a snapshot read, so a reconnect restores the exact
 * same private distribution.
 */
@Injectable()
export class StartDistributedInformation {
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
      input.contentItemIds.length !== DISTRIBUTED_INFORMATION_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== DISTRIBUTED_INFORMATION_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'DISTRIBUTED_REQUIRES_THREE_ITEMS',
        `Select exactly ${DISTRIBUTED_INFORMATION_ITEM_COUNT} distinct ContentItems`,
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'DISTRIBUTED_LAUNCH_FORBIDDEN',
        'Only the session controller can launch this challenge',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching this challenge',
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
    if (
      !configuration ||
      !configuration.isEnabled ||
      !mechanic ||
      mechanic.slug !== DISTRIBUTED_INFORMATION_MODE_KEY
    ) {
      throw new LiveSessionDomainError(
        'DISTRIBUTED_SLOT_INVALID',
        'The selected board position must use the canonical ركّبها mechanic',
      );
    }

    const teams = this.eligibleTeams(sessionState);
    const puzzles = await this.loadPuzzles(
      input.contentItemIds,
      input.worldId,
      String(mechanic._id),
    );

    const now = new Date();
    const deadlineAt = new Date(
      now.getTime() + DISTRIBUTED_INFORMATION_TIMER_SECONDS * 1000,
    );
    const plans = teams.map((team) =>
      this.planFor(team.teamId, team.participantIds, puzzles),
    );

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: DISTRIBUTED_INFORMATION_MODE_KEY,
      modeVersion: 1,
      initialState: {
        variant: DISTRIBUTED_INFORMATION_VARIANT,
        worldId: input.worldId,
        slotKey: input.slotKey,
        phase: 'active',
        puzzlesJson: JSON.stringify(puzzles),
        plansJson: JSON.stringify(plans),
        progressJson: JSON.stringify(
          plans.map((plan) => ({
            teamId: plan.teamId,
            solved: 0,
            wrongAttempts: 0,
            lastProgressAt: 0,
            lockUntil: 0,
          })),
        ),
        contentItemIdsJson: JSON.stringify(input.contentItemIds),
        startedAtMs: now.getTime(),
        deadlineAt: deadlineAt.toISOString(),
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
    const roundId = runtime.serialize().activeRound!.id;
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    // The race must resolve at the deadline even if nobody sends a command.
    await this.deadlines.schedule(input.sessionId);
    return this.getRuntime.execute(input.sessionId, actor);
  }

  /** Both teams, each with its connected players. Two or three each, no more. */
  private eligibleTeams(
    sessionState: ReturnType<
      import('../domain/live-game-session').LiveGameSession['serialize']
    >,
  ): Array<{ teamId: string; participantIds: string[] }> {
    const teams = sessionState.teams.filter((team) => team.active);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'DISTRIBUTED_REQUIRES_TWO_TEAMS',
        'This challenge is a race between exactly two teams',
      );
    }
    return teams.map((team) => {
      const participantIds = sessionState.participants
        .filter(
          (participant) =>
            participant.role === 'team-player' &&
            participant.teamId === team.id &&
            participant.connected &&
            !participant.removedAt,
        )
        .map((participant) => participant.id);
      if (participantIds.length < 2 || participantIds.length > 3) {
        throw new LiveSessionDomainError(
          'DISTRIBUTED_TEAM_SIZE_UNSUPPORTED',
          'Each team needs two or three connected players',
        );
      }
      return { teamId: team.id, participantIds };
    });
  }

  /** The three puzzles, read from authored content and never from a guess. */
  private async loadPuzzles(
    contentItemIds: string[],
    worldId: string,
    challengeTypeId: string,
  ): Promise<DistributedPuzzle[]> {
    const documents = await Promise.all(
      contentItemIds.map((id) => this.items.findById(id)),
    );
    return documents.map((item) => {
      const payload = item?.mechanicPayload as
        DistributedInformationPayload | undefined;
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== worldId ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === challengeTypeId,
        ) ||
        payload?.variant !== DISTRIBUTED_INFORMATION_VARIANT ||
        payload.authorSafetyConfirmation !== true ||
        !DISTRIBUTED_INFORMATION_ANSWER_MODES.includes(
          item.answerPayload
            .mode as (typeof DISTRIBUTED_INFORMATION_ANSWER_MODES)[number],
        )
      ) {
        throw new LiveSessionDomainError(
          'DISTRIBUTED_CONTENT_INVALID',
          'Every item must be ready, in the World, compatible, confirmed safe, and machine-checkable',
        );
      }
      return {
        contentItemId: String(item._id),
        publicPrompt: payload.publicPrompt.ar,
        segments: Object.fromEntries(
          payload.segments.map((segment) => [segment.id, segment.content.ar]),
        ),
        answer: this.answerContract(item.answerPayload),
      };
    });
  }

  private answerContract(
    answerPayload: import('../../world-content/domain/world-content.types').ContentAnswerPayload,
  ): DistributedPuzzle['answer'] {
    if (answerPayload.mode === 'closest') {
      return {
        mode: 'closest',
        correctValue: answerPayload.correctValue,
        tolerance: answerPayload.acceptedTolerance ?? 0,
      };
    }
    if (answerPayload.mode === 'multiple_choice') {
      return {
        mode: 'multiple_choice',
        correctOptionId: answerPayload.correctOptionId,
        options: answerPayload.options.map((option) => ({
          id: option.id,
          label: option.label.ar,
        })),
      };
    }
    if (answerPayload.mode === 'match') {
      return { mode: 'match', acceptedAnswers: answerPayload.acceptedAnswers };
    }
    // The content policy already refuses any other mode for this mechanic.
    throw new LiveSessionDomainError(
      'DISTRIBUTED_CONTENT_INVALID',
      'The answer must be a number, a short text, or a multiple choice',
    );
  }

  /**
   * One team's plan: its own puzzle order, a fair randomized answerer sequence,
   * and a segment distribution per puzzle. Three players hold one segment each;
   * two players use one of the author-approved merges.
   */
  private planFor(
    teamId: string,
    participantIds: string[],
    puzzles: DistributedPuzzle[],
  ): DistributedTeamPlan {
    const order = shuffled(puzzles.map((_, index) => index));
    const answererIds = this.answererSchedule(participantIds, puzzles.length);
    const assignments = order.map((puzzleIndex) =>
      this.distribute(
        participantIds,
        Object.keys(puzzles[puzzleIndex].segments),
      ),
    );
    return { teamId, participantIds, order, answererIds, assignments };
  }

  /**
   * Three players each answer exactly one puzzle, in a random order. Two players
   * alternate from a random start, giving A-B-A or B-A-B.
   */
  private answererSchedule(
    participantIds: string[],
    puzzleCount: number,
  ): string[] {
    if (participantIds.length >= puzzleCount) {
      return shuffled(participantIds).slice(0, puzzleCount);
    }
    const start = randomInt(participantIds.length);
    return Array.from(
      { length: puzzleCount },
      (_, index) => participantIds[(start + index) % participantIds.length],
    );
  }

  /** One segment each for three players; an approved 2+1 split for two. */
  private distribute(
    participantIds: string[],
    segmentIds: string[],
  ): DistributedAssignment[] {
    const shuffledSegments = shuffled(segmentIds);
    if (participantIds.length === segmentIds.length) {
      return shuffled(participantIds).map((participantId, index) => ({
        participantId,
        segmentIds: [shuffledSegments[index]],
      }));
    }
    const [first, second] = shuffled(participantIds);
    return [
      { participantId: first, segmentIds: shuffledSegments.slice(0, 2) },
      { participantId: second, segmentIds: shuffledSegments.slice(2) },
    ];
  }
}
