import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { GamesService } from '../games.service';

@Injectable()
export class QueryGameService {
  constructor(private readonly games: GamesService) {}
  list(user: AuthenticatedUser) {
    return this.games.findAll(user);
  }
  get(id: string, user: AuthenticatedUser) {
    return this.games.findById(id, user);
  }
}
