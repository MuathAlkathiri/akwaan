import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ScopedMechanicTutorial } from '../schemas/scoped-mechanic-tutorial.schema';

@Injectable()
export class ScopedMechanicTutorialRepository {
  constructor(
    @InjectModel(ScopedMechanicTutorial.name)
    private readonly model: Model<ScopedMechanicTutorial>,
  ) {}

  findByPair(worldId: string, challengeTypeId: string) {
    return this.model
      .findOne({
        worldId: new Types.ObjectId(worldId),
        challengeTypeId: new Types.ObjectId(challengeTypeId),
      })
      .exec();
  }

  create(data: Partial<ScopedMechanicTutorial>) {
    return this.model.create(data);
  }
}
