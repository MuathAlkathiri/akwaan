import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Game, QuestionInGame } from '../schemas/game.schema';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class GameActionPolicy {
  assertCanAccess(game: Game, user: AuthenticatedUser): void {
    if (user.role === UserRole.ADMIN) return;
    const owner = game.owner as unknown;
    const ownerId =
      owner && typeof owner === 'object' && '_id' in owner
        ? String(owner._id)
        : String(owner);
    if (ownerId !== user.id)
      throw new ForbiddenException('You do not have access to this game');
  }

  findQuestion(game: Game, questionId: Types.ObjectId): QuestionInGame {
    const question = game.board
      .flatMap((category) => category.questions)
      .find((candidate) => candidate.question.equals(questionId));
    if (!question)
      throw new BadRequestException('Question not found in this game board');
    return question;
  }

  assertUnanswered(question: QuestionInGame): void {
    if (question.isAnswered)
      throw new BadRequestException('Question is already answered');
  }
}
