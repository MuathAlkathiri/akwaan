import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ChallengeType } from '../schemas/challenge-type.schema';

@Injectable()
export class ChallengeTypeRepository {
  constructor(
    @InjectModel(ChallengeType.name)
    private readonly model: Model<ChallengeType>,
  ) {}

  list(filter: FilterQuery<ChallengeType> = {}): Promise<ChallengeType[]> {
    return this.model
      .find(filter)
      .sort({ family: 1, sortOrder: 1, name: 1 })
      .exec();
  }

  findById(id: string): Promise<ChallengeType | null> {
    return this.model.findById(id).exec();
  }

  findBySlug(slug: string): Promise<ChallengeType | null> {
    return this.model.findOne({ slug }).exec();
  }

  findByIds(ids: string[]): Promise<ChallengeType[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.model
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .exec();
  }

  create(data: Partial<ChallengeType>): Promise<ChallengeType> {
    return this.model.create(data);
  }

  updateById(
    id: string,
    data: Partial<ChallengeType>,
  ): Promise<ChallengeType | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string): Promise<ChallengeType | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const filter: FilterQuery<ChallengeType> = { slug };
    if (exceptId) filter._id = { $ne: new Types.ObjectId(exceptId) };
    return Boolean(await this.model.exists(filter));
  }

  async allIds(): Promise<Set<string>> {
    const rows = await this.model.find({}, { _id: 1 }).exec();
    return new Set(rows.map((row) => String(row._id)));
  }
}
