import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { MusicTrack } from '../schemas/music-track.schema';

@Injectable()
export class MusicTrackRepository {
  constructor(
    @InjectModel(MusicTrack.name) private readonly model: Model<MusicTrack>,
  ) {}

  create(payload: Record<string, unknown>) {
    return this.model.create(payload);
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 }).exec();
  }

  findById(id: string) {
    return this.model.findById(id).exec();
  }

  updateById(id: string, update: UpdateQuery<MusicTrack>) {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
