import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { CreateGameDto } from '../dto/create-game.dto';
import { GamesService } from '../games.service';

@Injectable()
export class CreateGameService {
  constructor(private readonly games: GamesService) {}
  execute(dto: CreateGameDto, user: AuthenticatedUser) {
    return this.games.create(dto, user);
  }

  replay(id: string, user: AuthenticatedUser) {
    return this.games.replay(id, user);
  }
}
