import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { GameplayRuntimeState } from '../domain/gameplay-runtime';

@Schema({
  collection: 'gameplay_runtimes',
  timestamps: false,
  versionKey: false,
})
export class GameplayRuntimeDocument {
  @Prop({ required: true, unique: true, index: true })
  runtimeId!: string;

  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ required: true, index: true })
  modeKey!: string;

  @Prop({ required: true })
  modeVersion!: number;

  @Prop({ required: true, index: true })
  status!: string;

  @Prop({ required: true })
  revision!: number;

  @Prop({ index: true, sparse: true })
  activeRoundId?: string;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ index: true, sparse: true })
  completedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  state!: GameplayRuntimeState;
}

export type GameplayRuntimeMongoDocument =
  HydratedDocument<GameplayRuntimeDocument>;
export const GameplayRuntimeSchema = SchemaFactory.createForClass(
  GameplayRuntimeDocument,
);
GameplayRuntimeSchema.index({ modeKey: 1, modeVersion: 1 });
