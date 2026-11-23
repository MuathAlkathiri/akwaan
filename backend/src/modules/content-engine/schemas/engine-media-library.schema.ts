import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

/**
 * A picture an Admin has chosen, once, to stand for a named subject.
 *
 * Search finds whatever the world happens to publish; some subjects — a club's
 * crest above all — are not there to be found, or are there in forms that give
 * the answer away. The library is the answer to both: the Admin uploads the
 * right picture one time, and every later question about that subject uses it
 * without searching.
 */
@Schema({ collection: 'engine_media_library', timestamps: true })
export class EngineMediaLibraryDocument {
  /** As an encyclopedia files it, in Latin script: "Leicester City F.C.". */
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: String, default: null }) nameAr!: string | null;
  @Prop({ type: [String], default: [] }) aliases!: string[];
  /** One of `BOMB_IMAGE_KINDS`; the same subject can have a crest and a photo. */
  @Prop({ type: String, required: true }) kind!: string;
  /**
   * Every name the subject goes by, reduced to comparable words. Matching is
   * on these, so "Leicester City FC" and "Leicester City F.C." are one key.
   */
  @Prop({ type: [String], required: true }) keys!: string[];
  @Prop({ type: SchemaTypes.Mixed, required: true }) asset!: {
    url: string;
    mimetype: string;
    width: number;
    height: number;
    sha256: string;
  };
  @Prop({ type: String, required: true }) createdBy!: string;
  @Prop({ type: String, required: true }) createdByEmail!: string;
}

export type EngineMediaLibraryEntry =
  HydratedDocument<EngineMediaLibraryDocument>;
export const EngineMediaLibrarySchema = SchemaFactory.createForClass(
  EngineMediaLibraryDocument,
);

EngineMediaLibrarySchema.index({ kind: 1, keys: 1 });
EngineMediaLibrarySchema.index({ kind: 1, name: 1 }, { unique: true });
EngineMediaLibrarySchema.index({ createdAt: -1 });
