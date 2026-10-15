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
  MOVING_XO_MODE_KEY,
  createMovingXoBoard,
} from '../domain/moving-xo-board';
import { CreateGameplayRuntime } from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import { StartTeamTurn, SwitchActiveTeam } from './live-session-turn.use-cases';

/**
 * Starts "Moving XO" with an empty board and **no puzzles**.
 *
 * This is the whole point of the mechanic's content model: there is no deck.
 * §23.11 fixes no question count, so the challenge opens on an empty 3×3 owing
 * its first puzzle, and every puzzle after that is drawn on demand once the turn
 * that needs it has committed. Nothing is reserved at launch, so an abandoned
 * challenge costs the account nothing.
 *
 * The starting team is **whichever team already owns the canonical Match turn**.
 * There is no coin flip here and no second first-player selection: the caller
 * passes the Match's own turn owner, and the session's active team is aligned to
 * it through the same turn use cases every other mechanic uses.
 */
@Injectable()
export class StartMovingXoGameplay {
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
    private readonly startTeamTurn: StartTeamTurn,
    private readonly switchActiveTeam: SwitchActiveTeam,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    /** The Match's current turn owner. */
    startingTeamId?: string;
    /** Accepted and asserted empty: Moving XO draws nothing at launch. */
    contentItemIds?: string[];
  }) {
    if (input.contentItemIds?.length) {
      throw new LiveSessionDomainError(
        'MOVING_XO_TAKES_NO_LAUNCH_CONTENT',
        'Moving XO draws its puzzles on demand and accepts none at launch',
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId) {
      throw new LiveSessionDomainError(
        'MOVING_XO_LAUNCH_FORBIDDEN',
        'Only the session controller can launch Moving XO',
      );
    }
    const sessionState = session.serialize();
    if (sessionState.status !== 'active') {
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching Moving XO',
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
    if (!configuration || !mechanic || mechanic.slug !== MOVING_XO_MODE_KEY) {
      throw new LiveSessionDomainError(
        'MOVING_XO_SLOT_INVALID',
        'The selected board slot must use the canonical Moving XO mechanic',
      );
    }

    const teams = sessionState.teams.map((team) => team.id);
    if (teams.length !== 2) {
      throw new LiveSessionDomainError(
        'MOVING_XO_REQUIRES_TWO_TEAMS',
        'Moving XO is played between exactly two teams',
      );
    }
    const startingTeamId = input.startingTeamId ?? sessionState.activeTeamId;
    if (!startingTeamId || !teams.includes(startingTeamId)) {
      throw new LiveSessionDomainError(
        'MOVING_XO_STARTING_TEAM_INVALID',
        'Moving XO requires the canonical active Match team to start',
      );
    }

    // Align the session's own turn with the Match's, so the runtime's active
    // team and the session's are the same team from the first puzzle onward.
    if (!sessionState.activeTeamId) {
      await this.startTeamTurn.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        commandId: randomUUID(),
        expectedRevision: session.revision,
        teamId: startingTeamId,
        reason: 'moving-xo-start',
      });
    } else if (sessionState.activeTeamId !== startingTeamId) {
      await this.switchActiveTeam.execute({
        sessionId: input.sessionId,
        actorId: input.actorId,
        commandId: randomUUID(),
        expectedRevision: session.revision,
        teamId: startingTeamId,
        reason: 'moving-xo-start',
      });
    }
    const launchedSession =
      (await this.sessions.findById(input.sessionId)) ?? session;

    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      modeKey: MOVING_XO_MODE_KEY,
      modeVersion: 1,
      initialState: {
        challengeId: randomUUID(),
        worldId: input.worldId,
        slotKey: input.slotKey,
        // The plugin owns the opening shape; these are the two facts only the
        // session can supply.
        teamIds: teams,
        activeTeamId: startingTeamId,
        board: createMovingXoBoard(teams),
      } as never,
    });

    let runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.startRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.createRound.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
      activeTeamId: startingTeamId,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    const roundId = runtime.serialize().activeRound!.id;
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: launchedSession.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    return this.runtimes.findBySessionId(input.sessionId);
  }
}
