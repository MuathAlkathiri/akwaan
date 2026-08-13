import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DifficultyLevel } from '../../questions/schemas/question.schema';

export enum MusicTrackLanguage {
  AR = 'ar',
  EN = 'en',
  OTHER = 'other',
}

export enum MusicTrackSource {
  ADMIN_UPLOAD = 'admin-upload',
}

@Schema({ timestamps: true })
export class MusicTrack extends Document {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  artist?: string;

  @Prop({ trim: true })
  album?: string;

  @Prop()
  originalAudioUrl?: string;

  @Prop({ required: true })
  snippetAudioUrl: string;

  @Prop()
  artworkUrl?: string;

  @Prop()
  durationSeconds?: number;

  @Prop()
  snippetStartSecond?: number;

  @Prop({ required: true, min: 10, max: 20 })
  snippetDurationSeconds: number;

  @Prop({ type: String, enum: MusicTrackLanguage })
  language?: MusicTrackLanguage;

  @Prop({ trim: true })
  genre?: string;

  @Prop({ type: String, enum: DifficultyLevel })
  difficulty?: DifficultyLevel;

  @Prop({
    type: String,
    enum: MusicTrackSource,
    default: MusicTrackSource.ADMIN_UPLOAD,
    required: true,
  })
  source: MusicTrackSource;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const MusicTrackSchema = SchemaFactory.createForClass(MusicTrack);

MusicTrackSchema.index({ title: 1, artist: 1 });
