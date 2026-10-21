import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Database lock for candidate -> canonical draft creation.
 *
 * The unique candidateId index, ContentItem insert, candidate pointer and this
 * row are committed in one Mongo transaction. A process crash therefore leaves
 * either the whole publication or none of it; a retry reads the winning row.
 */
@Schema({ collection: 'engine_draft_publications', timestamps: true })
export class EngineDraftPublicationDocument {
  @Prop({ type: String, required: true }) candidateId!: string;
  @Prop({ type: String, required: true }) jobId!: string;
  @Prop({ type: Number, required: true }) reviewRevision!: number;
  @Prop({ type: String, required: true }) contentItemId!: string;
  @Prop({ type: String, required: true }) createdBy!: string;
  @Prop({ type: String, required: true }) createdByEmail!: string;
}

export type EngineDraftPublication =
  HydratedDocument<EngineDraftPublicationDocument>;
export const EngineDraftPublicationSchema = SchemaFactory.createForClass(
  EngineDraftPublicationDocument,
);

EngineDraftPublicationSchema.index({ candidateId: 1 }, { unique: true });
EngineDraftPublicationSchema.index({ contentItemId: 1 }, { unique: true });
