import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
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
  MARHALA_DIFFICULTIES,
  MARHALA_MODE_KEY,
  MARHALA_START_POSITION,
} from '../domain/marhala-board';
import { CreateGameplayRuntime } from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';

/**
 * Starts "المرحلة" with a board and **no questions**.
 *
 * This is the whole point of the mechanic's content model: there is no deck. A
 * Marhala runtime begins as two tokens on tile 1 and an open difficulty decision,
 * and every question is drawn on demand once a team has committed to a risk level.
 * Nothing is reserved at launch, so an abandoned challenge costs the account
 * nothing.
 *
 * Difficulty availability starts optimistic and is maintained by the Match-side
 * supplier, which is the only layer that can see both the occurrence's Scopes and
 * the owner's exposure history.
 */
@Injectable()
export class StartMarhalaGameplay {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    /** Accepted and asserted empty: Marhala draws nothing at launch. */
    contentItemIds?: string[];
  }) {
    if (input.contentItemIds?.length) {
      throw new LiveSessionDomainError(
        'MARHALA_TAKES_NO_LAUNCH_CONTENT',
        'المرحلة draws its questions on demand and accepts none at launch',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'MARHALA_LAUNCH_FORBIDDEN',
        'Only the session controller can launch المرحلة',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching المرحلة',
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
    if (!configuration || !mechanic || mechanic.slug !== MARHALA_MODE_KEY) {
      throw new LiveSessionDomainError(
        'MARHALA_SLOT_INVALID',
        'The selected board slot must use the canonical المرحلة mechanic',
      );
    }

    const teams = sessionState.teams.map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'MARHALA_REQUIRES_TWO_TEAMS',
        'المرحلة is a race between exactly two teams',
      );
    }

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: MARHALA_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        teamIdsJson: JSON.stringify(teams),
        // Both tokens on the same opening tile; the coin toss already decided
        // which team the Match considers first, and that order is preserved here.
        positionsJson: JSON.stringify(
          Object.fromEntries(teams.map((id) => [id, MARHALA_START_POSITION])),
        ),
        activeTeamIndex: 0,
        turnsJson: '[]',
        phase: 'difficulty-choice',
        // Optimistic until the supplier has looked: a difficulty the catalog
        // cannot serve is refused at the draw, never silently downgraded.
        availableDifficultiesJson: JSON.stringify([...MARHALA_DIFFICULTIES]),
        questionJson: null,
        selectedDifficulty: null,
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
    return this.runtimes.findBySessionId(input.sessionId);
  }
}
