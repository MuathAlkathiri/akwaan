import { BadRequestException, Injectable } from '@nestjs/common';
import { Game, QuestionInGame } from '../schemas/game.schema';

@Injectable()
export class ScoringPolicy {
  assertTeamIndex(teamIndex: number): asserts teamIndex is 0 | 1 {
    if (teamIndex !== 0 && teamIndex !== 1)
      throw new BadRequestException('Team index must be 0 or 1');
  }

  award(game: Game, question: QuestionInGame, teamIndex: 0 | 1): void {
    question.isAnswered = true;
    question.isAnswerRevealed = true;
    question.answeredByTeamIndex = teamIndex;
    question.awardedPoints = question.points;
    game.teams[teamIndex].score += question.points;
  }
}
