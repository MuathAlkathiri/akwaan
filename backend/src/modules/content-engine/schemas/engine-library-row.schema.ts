import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  LIBRARY_REVIEW_STATUSES,
  LIBRARY_ROLES,
  LIBRARY_SCOPE_STATUSES,
  LibraryReviewStatus,
  LibraryRole,
  LibraryScopeStatus,
  LibrarySheetRow,
  LibrarySourceWarning,
  LibraryTop5Facts,
} from '../domain/library-row';

/**
 * One row of the verified question library.
 *
 * Every workbook row is stored, including PARK and REJECT, so a re-import can
 * promote or withdraw a row by id. Storage is not eligibility: generation reads
 * this collection only through `isLibraryRowGenerationEligible`.
 */
@Schema({ collection: 'engine_library_rows', timestamps: true })
export class EngineLibraryRowDocument {
  @Prop({ type: String, required: true }) libraryId!: string;
  @Prop({ type: String, default: null }) sourceRef!: string | null;
  @Prop({ type: String, default: null }) worldKey!: string | null;
  @Prop({ type: String, default: null }) scopeKey!: string | null;

  @Prop({ type: String, required: true, enum: LIBRARY_SCOPE_STATUSES })
  scopeStatus!: LibraryScopeStatus;

  @Prop({ type: String, required: true, enum: LIBRARY_ROLES })
  role!: LibraryRole;

  @Prop({ type: String, required: true, enum: LIBRARY_REVIEW_STATUSES })
  reviewStatus!: LibraryReviewStatus;

  @Prop({ type: [String], default: [] }) mechanicKeys!: string[];
  @Prop({ type: String, default: null }) akwaanFit!: string | null;
  @Prop({ type: String, default: null }) qualityP1!: string | null;
  @Prop({ type: String, required: true }) questionText!: string;
  @Prop({ type: Boolean, required: true }) hasApprovedRewrite!: boolean;
  @Prop({ type: [String], default: [] }) options!: string[];
  @Prop({ type: String, default: null }) verifiedAnswer!: string | null;
  @Prop({ type: String, default: null }) canonicalAnswer!: string | null;
  @Prop({ type: Number, default: null }) canonicalNumber!: number | null;
  @Prop({ type: String, default: null }) sourceUrl!: string | null;

  @Prop({ type: String, default: null })
  sourceWarning!: LibrarySourceWarning | null;

  @Prop({ type: String, default: null }) verifiedOn!: string | null;
  @Prop({ type: Boolean, required: true }) asofNeeded!: boolean;

  @Prop({ type: String, default: null })
  nextEventDateEstimate!: string | null;

  @Prop({ type: String, default: null }) revalidateAfter!: string | null;
  @Prop({ type: Object, default: null }) top5!: LibraryTop5Facts | null;
  @Prop({ type: Object, required: true }) raw!: LibrarySheetRow;
  @Prop({ type: String, required: true }) rowHash!: string;

  /** Set when a later workbook no longer carries this row. */
  @Prop({ type: Boolean, required: true, default: false }) retired!: boolean;
}

export type EngineLibraryRow = HydratedDocument<EngineLibraryRowDocument>;
export const EngineLibraryRowSchema = SchemaFactory.createForClass(
  EngineLibraryRowDocument,
);

EngineLibraryRowSchema.index({ libraryId: 1 }, { unique: true });
EngineLibraryRowSchema.index({ worldKey: 1, scopeKey: 1, reviewStatus: 1 });
