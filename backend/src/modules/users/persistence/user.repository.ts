import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { User } from '../schemas/user.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  findByEmailWithPassword(email: string) {
    return this.model.findOne({ email }).select('+password').exec();
  }

  findById(id: string | Types.ObjectId) {
    return this.model.findById(id).exec();
  }

  findByIdWithPassword(id: string | Types.ObjectId) {
    return this.model.findById(id).select('+password').exec();
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 }).exec();
  }

  create(payload: Record<string, unknown>) {
    return this.model.create(payload);
  }

  updateById(id: string | Types.ObjectId, update: UpdateQuery<User>) {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .exec();
  }
}
