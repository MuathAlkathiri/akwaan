import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export const PARENT_GAME_ACCESS = Symbol('PARENT_GAME_ACCESS');

export interface ParentGameplaySetup {
  sessionModeKey: string;
  sessionModeVersion: number;
  runtimeModeKey: string;
  runtimeModeVersion: number;
  initialRuntimeState?: Record<string, string | number | boolean | null>;
  teamNames?: string[];
}

export interface ParentGameAccess {
  assertAccessible(
    parentGameId: string,
    actor: AuthenticatedUser,
  ): Promise<void>;
  gameplaySetup(
    parentGameId: string,
    parentGameQuestionId?: string,
  ): Promise<ParentGameplaySetup>;
  markQuestionStarted(
    parentGameId: string,
    parentGameQuestionId: string,
  ): Promise<void>;
  finalizeBombQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
    winnerTeamIndex: number,
  ): Promise<void>;
}
