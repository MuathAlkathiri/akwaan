import { Injectable } from '@nestjs/common';
import { Game } from '../schemas/game.schema';

@Injectable()
export class GameLifecyclePolicy {
  isComplete(game: Game): boolean {
    return game.board.every((category) =>
      category.questions.every((question) => question.isAnswered),
    );
  }

  advanceTurn(game: Game): void {
    game.currentTurnTeamIndex = game.currentTurnTeamIndex === 0 ? 1 : 0;
  }
}
