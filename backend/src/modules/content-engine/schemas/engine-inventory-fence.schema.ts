import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Serializes Content Engine inventory changes for one resolved Scope. */
@Schema({ collection: 'engine_inventory_fences', versionKey: false })
export class EngineInventoryFence {
  @Prop({ type: Types.ObjectId, required: true })
  _id!: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0 })
  revision!: number;
}

export const EngineInventoryFenceSchema =
  SchemaFactory.createForClass(EngineInventoryFence);
