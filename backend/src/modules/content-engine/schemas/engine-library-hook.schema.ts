import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  LIBRARY_HOOK_TYPES,
  LibraryHookType,
  LibrarySheetRow,
} from '../domain/library-row';

/**
 * One row of the workbook's Hooks sheet. Anti-patterns are stored so they stay
 * readable as review material; `isLibraryHookWriterEligible` keeps them away
 * from generation.
 */
@Schema({ collection: 'engine_library_hooks', timestamps: true })
export class EngineLibraryHookDocument {
  @Prop({ type: String, required: true }) hookId!: string;

  @Prop({ type: String, required: true, enum: LIBRARY_HOOK_TYPES })
  type!: LibraryHookType;

  @Prop({ type: String, required: true }) nameAr!: string;
  @Prop({ type: String, required: true }) description!: string;
  @Prop({ type: [String], default: [] }) mechanicKeys!: string[];
  @Prop({ type: String, default: null }) caution!: string | null;
  @Prop({ type: String, default: null }) status!: string | null;
  @Prop({ type: Object, required: true }) raw!: LibrarySheetRow;
  @Prop({ type: String, required: true }) rowHash!: string;
  @Prop({ type: Boolean, required: true, default: false }) retired!: boolean;
}

export type EngineLibraryHook = HydratedDocument<EngineLibraryHookDocument>;
export const EngineLibraryHookSchema = SchemaFactory.createForClass(
  EngineLibraryHookDocument,
);

EngineLibraryHookSchema.index({ hookId: 1 }, { unique: true });
