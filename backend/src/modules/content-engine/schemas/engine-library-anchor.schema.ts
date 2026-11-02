import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { LibrarySheetRow } from '../domain/library-row';

/**
 * One curated Closest anchor. The writer may use an anchor only from the bank of
 * its Scope's World, so a human curating this collection is what answers "is
 * this a good anchor", and no prompt instruction has to.
 */
@Schema({ collection: 'engine_library_anchors', timestamps: true })
export class EngineLibraryAnchorDocument {
  @Prop({ type: String, required: true }) anchorId!: string;
  @Prop({ type: String, required: true }) worldKey!: string;
  @Prop({ type: String, required: true }) labelAr!: string;
  @Prop({ type: Number, default: null }) year!: number | null;
  @Prop({ type: String, default: null }) sourceUrl!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Object, required: true }) raw!: LibrarySheetRow;
  @Prop({ type: String, required: true }) rowHash!: string;
  @Prop({ type: Boolean, required: true, default: false }) retired!: boolean;
}

export type EngineLibraryAnchor = HydratedDocument<EngineLibraryAnchorDocument>;
export const EngineLibraryAnchorSchema = SchemaFactory.createForClass(
  EngineLibraryAnchorDocument,
);

EngineLibraryAnchorSchema.index({ anchorId: 1 }, { unique: true });
EngineLibraryAnchorSchema.index({ worldKey: 1, retired: 1 });
