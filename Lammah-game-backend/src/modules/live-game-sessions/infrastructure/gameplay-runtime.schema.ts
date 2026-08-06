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

  /**
   * A session plays one challenge at a time but many across a Match, so this is
   * not globally unique. The partial index below still allows only one *live*
   * runtime per session; terminal runtimes stay as history.
   */
  @Prop({ required: true })
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

  /** Mirrored out of the state so the newest runtime of a session is cheap to find. */
  @Prop({ required: true, index: true })
  createdAt!: Date;

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
GameplayRuntimeSchema.index({ sessionId: 1, createdAt: -1 });

/** Statuses in which a runtime is still being played. */
export const LIVE_GAMEPLAY_RUNTIME_STATUSES = [
  'initialized',
  'awaiting-round',
  'round-active',
  'round-paused',
  'between-rounds',
];

// At most one live runtime per session; completed and cancelled ones are history.
// Named explicitly so it can never collide with the legacy `sessionId_1` unique
// index that migrate:gameplay-runtime-indexes drops.
GameplayRuntimeSchema.index(
  { sessionId: 1 },
  {
    name: 'sessionId_live_unique',
    unique: true,
    partialFilterExpression: {
      status: { $in: LIVE_GAMEPLAY_RUNTIME_STATUSES },
    },
  },
);
