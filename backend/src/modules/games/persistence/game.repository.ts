import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Game } from '../schemas/game.schema';

const hiddenAnswerPopulation = [
  { path: 'owner', select: '-password' },
  { path: 'selectedCategories' },
  { path: 'board.category' },
  {
    path: 'board.questions.question',
    select:
      '-answer -correctAnswer -rankedList.entries.answer -rankedList.entries.aliases',
  },
];

const revealedAnswerPopulation = [
  { path: 'owner', select: '-password' },
  { path: 'selectedCategories' },
  { path: 'board.category' },
  { path: 'board.questions.question' },
];

@Injectable()
export class GameRepository {
  constructor(@InjectModel(Game.name) private readonly model: Model<Game>) {}

  create(payload: Record<string, unknown>) {
    return this.model.create(payload);
  }

  populate(game: Game, revealAnswers = false) {
    return game.populate(
      revealAnswers ? revealedAnswerPopulation : hiddenAnswerPopulation,
    );
  }

  findAll(ownerId?: string) {
    const filter = ownerId ? { owner: new Types.ObjectId(ownerId) } : {};
    return this.model.find(filter).populate(hiddenAnswerPopulation).exec();
  }

  findById(id: string, populated = false) {
    const query = this.model.findById(id);
    return populated
      ? query.populate(hiddenAnswerPopulation).exec()
      : query.exec();
  }
}
