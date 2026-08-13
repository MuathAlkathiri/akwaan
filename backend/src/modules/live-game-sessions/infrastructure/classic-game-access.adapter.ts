import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { GamesService } from '../../games/games.service';
import { ParentGameAccess } from '../application/parent-game-access.port';

@Injectable()
export class ClassicGameAccessAdapter implements ParentGameAccess {
  constructor(private readonly games: GamesService) {}

  async assertAccessible(
    parentGameId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.games.findById(parentGameId, actor);
  }

  gameplaySetup(parentGameId: string, parentGameQuestionId?: string) {
    return this.games.liveGameplaySetup(parentGameId, parentGameQuestionId);
  }

  markQuestionStarted(parentGameId: string, parentGameQuestionId: string) {
    return this.games.markLiveQuestionStarted(
      parentGameId,
      parentGameQuestionId,
    );
  }

  finalizeBombQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
    winnerTeamIndex: number,
  ) {
    return this.games.finalizeBombQuestion(
      parentGameId,
      parentGameQuestionId,
      winnerTeamIndex,
    );
  }
}
