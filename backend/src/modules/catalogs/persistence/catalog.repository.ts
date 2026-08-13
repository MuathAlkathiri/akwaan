import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Catalog } from '../schemas/catalog.schema';

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectModel(Catalog.name) private readonly model: Model<Catalog>,
  ) {}

  create(payload: Record<string, unknown>) {
    return this.model.create(payload);
  }
  findAll() {
    return this.model.find().sort({ sortOrder: 1, createdAt: 1 }).exec();
  }
  findById(id: string) {
    return this.model.findById(id).exec();
  }
  findReferenceById(id: string) {
    return this.model.findById(id).select('_id').exec();
  }
  findBySlugExcludingId(slug: string, excludedId?: string) {
    return this.model
      .findOne({ slug, ...(excludedId ? { _id: { $ne: excludedId } } : {}) })
      .exec();
  }
  updateById(id: string, payload: Record<string, unknown>) {
    return this.model
      .findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .exec();
  }
  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
