import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Scope } from '../schemas/scope.schema';

@Injectable()
export class ScopeRepository {
  constructor(@InjectModel(Scope.name) private readonly model: Model<Scope>) {}

  listByWorld(worldId: string): Promise<Scope[]> {
    return this.model
      .find({ worldId: new Types.ObjectId(worldId) })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  list(): Promise<Scope[]> {
    return this.model.find().sort({ sortOrder: 1, name: 1 }).exec();
  }

  findById(id: string): Promise<Scope | null> {
    return this.model.findById(id).exec();
  }

  create(data: Partial<Scope>): Promise<Scope> {
    return this.model.create(data);
  }

  updateById(id: string, data: Partial<Scope>): Promise<Scope | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string): Promise<Scope | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  countByWorld(worldId: string): Promise<number> {
    return this.model
      .countDocuments({ worldId: new Types.ObjectId(worldId) })
      .exec();
  }

  async slugTakenInWorld(
    worldId: string,
    slug: string,
    exceptId?: string,
  ): Promise<boolean> {
    const filter: FilterQuery<Scope> = {
      worldId: new Types.ObjectId(worldId),
      slug,
    };
    if (exceptId) filter._id = { $ne: new Types.ObjectId(exceptId) };
    return Boolean(await this.model.exists(filter));
  }

  countExcludingChallengeType(challengeTypeId: string): Promise<number> {
    return this.model
      .countDocuments({
        excludedChallengeTypeIds: new Types.ObjectId(challengeTypeId),
      })
      .exec();
  }

  async removeChallengeTypeFromExclusions(
    challengeTypeId: string,
  ): Promise<number> {
    const result = await this.model
      .updateMany(
        { excludedChallengeTypeIds: new Types.ObjectId(challengeTypeId) },
        {
          $pull: {
            excludedChallengeTypeIds: new Types.ObjectId(challengeTypeId),
          },
        },
      )
      .exec();
    return result.modifiedCount ?? 0;
  }
}
