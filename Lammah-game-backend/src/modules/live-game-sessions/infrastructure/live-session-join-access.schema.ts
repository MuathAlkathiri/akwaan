import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';
import { LiveSessionJoinAccessState } from '../domain/live-session-join-access';

@Schema({
  collection: 'live_session_join_access',
  timestamps: false,
  versionKey: false,
})
export class LiveSessionJoinAccessDocument {
  @Prop({ required: true, unique: true, index: true })
  accessId!: string;

  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true, unique: true, index: true })
  normalizedCode!: string;

  @Prop({ required: true, index: true })
  enabled!: boolean;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ required: true })
  revision!: number;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  state!: LiveSessionJoinAccessState;
}

export type LiveSessionJoinAccessMongoDocument =
  HydratedDocument<LiveSessionJoinAccessDocument>;
export const LiveSessionJoinAccessSchema = SchemaFactory.createForClass(
  LiveSessionJoinAccessDocument,
);
LiveSessionJoinAccessSchema.index(
  { sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { enabled: true },
    name: 'one_enabled_join_access_per_session',
  },
);
