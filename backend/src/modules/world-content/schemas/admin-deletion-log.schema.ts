import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

/**
 * One row per executed Admin permanent deletion or detach.
 *
 * Written inside the deletion transaction as its last write, so a row exists if
 * and only if the deletion committed. `requestId` is unique: a retried request
 * (double click, network retry) finds its row and gets the stored result back
 * instead of deleting twice.
 *
 * This is an integrity record, not gameplay history: keep it.
 */
@Schema({ collection: 'admin_deletion_log', versionKey: false })
export class AdminDeletionLog {
  @Prop({ required: true, unique: true })
  requestId!: string;

  @Prop({ required: true })
  operation!: string;

  /** `{ kind, id, name, key?, status? }` of the root entity. */
  @Prop({ type: SchemaTypes.Mixed, required: true })
  entity!: Record<string, unknown>;

  /** `{ id, email, role }` of the operator. */
  @Prop({ type: SchemaTypes.Mixed, required: true })
  actor!: Record<string, unknown>;

  @Prop({ required: true })
  previewFingerprint!: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  options!: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  counts!: Record<string, number>;

  /** Full id lists of what was deleted or detached, by record type. */
  @Prop({ type: SchemaTypes.Mixed, required: true })
  affectedIds!: Record<string, string[]>;

  /** Media URLs the deleted records used that no remaining ContentItem uses. */
  @Prop({ type: [String], default: [] })
  unreferencedMediaCandidates!: string[];

  @Prop({ required: true })
  committedAt!: Date;
}

export const AdminDeletionLogSchema =
  SchemaFactory.createForClass(AdminDeletionLog);
AdminDeletionLogSchema.index({ 'entity.kind': 1, 'entity.id': 1 });
