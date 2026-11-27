import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One drawing of a وش الفرق؟ scene, kept so the scene is drawn once.
 *
 * Every question about a scene takes a different thing out of the same
 * drawing. Without this each question would pay for the whole scene again.
 * The key carries the scene's wording and the model that drew it, so a
 * reworded scene or a new model draws afresh and the old drawing is left be.
 */
@Schema({ collection: 'engine_difference_scenes', timestamps: true })
export class EngineDifferenceSceneDocument {
  @Prop({ type: String, required: true, unique: true }) key!: string;
  @Prop({ type: String, required: true }) model!: string;
  @Prop({ type: Buffer, required: true }) png!: Buffer;
}

export type EngineDifferenceScene =
  HydratedDocument<EngineDifferenceSceneDocument>;
export const EngineDifferenceSceneSchema = SchemaFactory.createForClass(
  EngineDifferenceSceneDocument,
);
