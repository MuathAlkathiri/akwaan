import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

/**
 * Persisted Match state.
 *
 * Stored separately from the gameplay runtime: a Match outlives any single
 * mechanic run. Score events are kept in their plain persisted shape and are only
 * ever rehydrated through the scoring module.
 */
@Schema({ collection: 'matches', timestamps: true, versionKey: false })
export class MatchDocument {
  @Prop({ required: true, unique: true, index: true })
  matchId!: string;

  @Prop({ required: true, index: true })
  liveSessionId!: string;

  /**
   * Which journey this Match obeys. Absent on every Match stored before the
   * unified redesign, and those must keep playing the sequential flow, so the
   * mapper defaults a missing value to `legacy_sequential` rather than assuming
   * the new contract.
   */
  @Prop({ index: true })
  setupMode?: string;

  @Prop({ required: true, index: true })
  status!: string;

  @Prop({ required: true })
  stage!: string;

  @Prop({ required: true })
  stageEnteredAt!: Date;

  @Prop({ required: true })
  revision!: number;

  @Prop({ type: [String], default: [] })
  processedCommandIds!: string[];

  @Prop({ type: SchemaTypes.Mixed, required: true })
  teams!: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  coinToss?: unknown;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  selections!: unknown;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  occurrences!: unknown;

  /** Legacy sequential only; a unified Match stores -1. */
  @Prop({ required: true, default: 0 })
  currentOccurrenceIndex!: number;

  /** Unified only: the twelve board positions and the mechanic in each. */
  @Prop({ type: SchemaTypes.Mixed, default: [] })
  configuredBoardPositions!: unknown;

  /** Unified only: the team whose turn it is to choose a board position. */
  @Prop()
  selectingTeamId?: string;

  /**
   * Unified only: the board position chosen and waiting on its phones. Persisted so
   * a refresh — or a backend restart — restores the same preflight rather than
   * losing it and stranding the host.
   */
  @Prop({ type: SchemaTypes.Mixed })
  pendingChallenge?: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  currentChallenge?: unknown;

  /** Plain persisted score events; restored through ScoringService only. */
  @Prop({ type: SchemaTypes.Mixed, default: [] })
  scoreEvents!: unknown;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export type MatchHydratedDocument = HydratedDocument<MatchDocument>;
export const MatchSchema = SchemaFactory.createForClass(MatchDocument);
// One active Match per live session; completed and cancelled ones may accumulate.
MatchSchema.index(
  { liveSessionId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['draft', 'active'] } },
  },
);
