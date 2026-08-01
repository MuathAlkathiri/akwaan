import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RevealAnswerDto, SkipQuestionDto } from '../dto/create-game.dto';
import { GamesService } from '../games.service';

@Injectable()
export class GameProgressService {
  constructor(private readonly games: GamesService) {}
  reveal(id: string, dto: RevealAnswerDto, user: AuthenticatedUser) {
    return this.games.revealAnswer(id, dto, user);
  }
  skip(id: string, dto: SkipQuestionDto, user: AuthenticatedUser) {
    return this.games.skipQuestion(id, dto, user);
  }
  changeTurn(id: string, user: AuthenticatedUser) {
    return this.games.changeTurn(id, user);
  }
}
