import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { World } from '../schemas/world.schema';

@Injectable()
export class WorldRepository {
  constructor(@InjectModel(World.name) private readonly model: Model<World>) {}

  list(filter: FilterQuery<World> = {}): Promise<World[]> {
    return this.model.find(filter).sort({ sortOrder: 1, name: 1 }).exec();
  }

  findById(id: string): Promise<World | null> {
    return this.model.findById(id).exec();
  }

  create(data: Partial<World>): Promise<World> {
    return this.model.create(data);
  }

  updateById(id: string, data: Partial<World>): Promise<World | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string): Promise<World | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const filter: FilterQuery<World> = { slug };
    if (exceptId) filter._id = { $ne: new Types.ObjectId(exceptId) };
    return Boolean(await this.model.exists(filter));
  }
}
