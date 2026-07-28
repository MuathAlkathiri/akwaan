import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { LiveGameSessionState } from '../domain/live-game-session';

@Schema({
  collection: 'live_game_sessions',
  timestamps: false,
  versionKey: false,
})
export class LiveGameSessionDocument {
  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ index: true, sparse: true })
  parentGameId?: string;

  @Prop({ index: true, sparse: true })
  parentGameQuestionId?: string;

  @Prop({ required: true, index: true })
  status!: string;

  @Prop({ required: true })
  modeKey!: string;

  @Prop({ required: true })
  modeVersion!: number;

  @Prop({ required: true, index: true })
  controllerActorId!: string;

  @Prop({ required: true })
  revision!: number;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  state!: LiveGameSessionState;
}

export type LiveGameSessionMongoDocument =
  HydratedDocument<LiveGameSessionDocument>;
export const LiveGameSessionSchema = SchemaFactory.createForClass(
  LiveGameSessionDocument,
);
LiveGameSessionSchema.index({
  'state.participants.reconnectTokenHash': 1,
});
LiveGameSessionSchema.index(
  { parentGameId: 1, parentGameQuestionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      parentGameId: { $type: 'string' },
      parentGameQuestionId: { $type: 'string' },
    },
  },
);
