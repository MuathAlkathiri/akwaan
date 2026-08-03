import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorldChallengeConfiguration } from '../schemas/world-challenge-configuration.schema';

@Injectable()
export class WorldChallengeConfigurationRepository {
  constructor(
    @InjectModel(WorldChallengeConfiguration.name)
    private readonly model: Model<WorldChallengeConfiguration>,
  ) {}

  listByWorld(worldId: string): Promise<WorldChallengeConfiguration[]> {
    return this.model
      .find({ worldId: new Types.ObjectId(worldId) })
      .sort({ sortOrder: 1 })
      .exec();
  }

  list(): Promise<WorldChallengeConfiguration[]> {
    return this.model.find().sort({ sortOrder: 1 }).exec();
  }

  /** Every World a set of challenge types is configured in, for exclusivity and differentiation. */
  listByChallengeTypes(
    challengeTypeIds: string[],
  ): Promise<WorldChallengeConfiguration[]> {
    if (!challengeTypeIds.length) return Promise.resolve([]);
    return this.model
      .find({
        challengeTypeId: {
          $in: challengeTypeIds.map((id) => new Types.ObjectId(id)),
        },
      })
      .exec();
  }

  findById(id: string): Promise<WorldChallengeConfiguration | null> {
    return this.model.findById(id).exec();
  }

  /** One configuration per board position; the mechanic may repeat. */
  findByWorldAndSlot(
    worldId: string,
    slotKey: string,
  ): Promise<WorldChallengeConfiguration | null> {
    return this.model
      .findOne({ worldId: new Types.ObjectId(worldId), slotKey })
      .exec();
  }

  findByWorldAndChallengeType(
    worldId: string,
    challengeTypeId: string,
  ): Promise<WorldChallengeConfiguration | null> {
    return this.model
      .findOne({
        worldId: new Types.ObjectId(worldId),
        challengeTypeId: new Types.ObjectId(challengeTypeId),
      })
      .exec();
  }

  create(
    data: Partial<WorldChallengeConfiguration>,
  ): Promise<WorldChallengeConfiguration> {
    return this.model.create(data);
  }

  updateById(
    id: string,
    data: Partial<WorldChallengeConfiguration>,
  ): Promise<WorldChallengeConfiguration | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string): Promise<WorldChallengeConfiguration | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  countByChallengeType(challengeTypeId: string): Promise<number> {
    return this.model
      .countDocuments({ challengeTypeId: new Types.ObjectId(challengeTypeId) })
      .exec();
  }

  countByWorld(worldId: string): Promise<number> {
    return this.model
      .countDocuments({ worldId: new Types.ObjectId(worldId) })
      .exec();
  }
}
