import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from '../schemas/category.schema';

@Injectable()
export class CategoryRepository {
  constructor(
    @InjectModel(Category.name) private readonly model: Model<Category>,
  ) {}

  create(payload: Record<string, unknown>) {
    return this.model.create(payload);
  }
  findBySlugExcludingId(slug: string, excludedId?: string) {
    return this.model
      .findOne({ slug, ...(excludedId ? { _id: { $ne: excludedId } } : {}) })
      .exec();
  }
  findAll(catalogId?: string) {
    const filter = catalogId
      ? { catalogId: new Types.ObjectId(catalogId) }
      : {};
    return this.model
      .find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .populate('catalog', '_id name slug')
      .exec();
  }
  findById(id: string, populated = true) {
    const query = this.model.findById(id);
    return populated
      ? query.populate('catalog', '_id name slug').exec()
      : query.exec();
  }
  findActiveMusicCategory(configuredSlug: string) {
    return this.model
      .findOne({
        isActive: true,
        $or: [
          { slug: configuredSlug },
          { slug: 'music' },
          { slug: 'songs' },
          { name: /^(music|songs|أغاني|اغاني|موسيقى)$/i },
        ],
      })
      .exec();
  }
  updateById(id: string, payload: Record<string, unknown>) {
    return this.model
      .findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .populate('catalog', '_id name slug')
      .exec();
  }
  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
