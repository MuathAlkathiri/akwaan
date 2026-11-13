import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ASSET_RIGHTS_BASES,
  AssetRightsBasis,
  CLEARANCE_STATUSES,
  ClearanceStatus,
  LIKENESS_USE_BASES,
  LikenessUseBasis,
} from '../domain/media-rights.policy';

/**
 * Rights evidence for one managed media asset. Informational metadata: no
 * readiness, promotion or release decision consults it.
 *
 * A sidecar, like `content_exposures`: it references the asset and never lives
 * inside it. Gameplay reads `media.assets[].{url, altText}` and must keep doing
 * exactly that — putting licence metadata on a ContentItem would ship rights
 * data into every gameplay snapshot and give the same asset a different answer
 * in every item that uses it.
 *
 * Keyed by `assetUrl`, which is what the runtime already persists. The other two
 * forms are pure functions of it and are never stored:
 *
 *   assetUrl    /uploads/questions/bomb-items/x.jpg
 *   storageKey  uploads/questions/bomb-items/x.jpg     = assetUrl.slice(1)
 *   R2 key      questions/bomb-items/x.jpg             = assetUrl minus /uploads/
 *
 * No UUID is minted. A second identity would have to be kept in step with the
 * first, and the first is already unique and stable.
 */
@Schema({ _id: false })
export class AssetRightsLayer {
  @Prop({ type: String, required: true, enum: CLEARANCE_STATUSES, default: 'UNKNOWN' })
  status!: ClearanceStatus;

  @Prop({ type: String, enum: ASSET_RIGHTS_BASES, default: null })
  basisType!: AssetRightsBasis | null;

  /** The exact licence, e.g. `CC BY-SA 3.0`. Free text: licence names are not a closed set. */
  @Prop({ type: String, trim: true, default: null })
  licence!: string | null;

  @Prop({ type: String, trim: true, default: null })
  rightsHolder!: string | null;

  @Prop({ type: Boolean, default: null })
  modificationAllowed!: boolean | null;

  @Prop({ type: String, trim: true, default: null })
  redistributionNote!: string | null;

  /** Layer 1 can lapse too — a commercial licence or a grant may be time-boxed. */
  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  /** A pointer to evidence held elsewhere. Never a document body. */
  @Prop({ type: String, trim: true, default: null })
  evidenceRef!: string | null;
}

@Schema({ _id: false })
export class LikenessUseBasisLayer {
  @Prop({ type: String, required: true, enum: CLEARANCE_STATUSES, default: 'UNKNOWN' })
  status!: ClearanceStatus;

  @Prop({ type: String, enum: LIKENESS_USE_BASES, default: null })
  basisType!: LikenessUseBasis | null;

  /** Who granted it — subject, management, broadcaster, agency. */
  @Prop({ type: String, trim: true, default: null })
  grantedBy!: string | null;

  @Prop({ type: String, trim: true, default: null })
  commercialUseScope!: string | null;

  @Prop({ type: String, trim: true, default: null })
  territory!: string | null;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Boolean, default: null })
  modificationAllowed!: boolean | null;

  @Prop({ type: String, trim: true, default: null })
  evidenceRef!: string | null;
}

/**
 * Attribution ingredients.
 *
 * Deliberately not a clearance state. An asset can be cleared on both layers and
 * still owe visible credit; an asset can owe no credit and still be unusable.
 * Rendering these is a separate, later system.
 */
@Schema({ _id: false })
export class MediaAttribution {
  /**
   * Whether credit must be shown.
   *
   * Derived from the licence where the basis settles it, and stated explicitly
   * where it does not. `requirementBasis` records which of the two happened, so
   * a reviewer can tell an inference from a reading of a contract.
   */
  @Prop({ type: Boolean, default: null })
  required!: boolean | null;

  @Prop({ type: String, enum: ['derived-from-licence', 'evidence'], default: null })
  requirementBasis!: 'derived-from-licence' | 'evidence' | null;

  @Prop({ type: String, trim: true, default: null })
  text!: string | null;

  @Prop({ type: String, trim: true, default: null })
  sourceUrl!: string | null;

  @Prop({ type: String, trim: true, default: null })
  licenceUrl!: string | null;
}

@Schema({ collection: 'media_rights', timestamps: true, versionKey: false })
export class MediaRightsDocument {
  /** Canonical identity. Exactly the url the runtime stores on the ContentAsset. */
  @Prop({ type: String, required: true, trim: true })
  assetUrl!: string;

  /** Integrity evidence — proves which bytes were cleared. Never identity. */
  @Prop({ type: String, trim: true, default: null })
  assetSha256!: string | null;

  @Prop({ type: String, trim: true, default: null })
  originalSourceUrl!: string | null;

  @Prop({ type: AssetRightsLayer, required: true, _id: false })
  assetRights!: AssetRightsLayer;

  @Prop({ type: LikenessUseBasisLayer, required: true, _id: false })
  likenessUseBasis!: LikenessUseBasisLayer;

  @Prop({ type: MediaAttribution, default: () => ({}), _id: false })
  attribution!: MediaAttribution;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, trim: true, default: null })
  reviewedBy!: string | null;

  /** Internal. Never projected to a player-facing payload. */
  @Prop({ type: String, trim: true, default: null })
  notes!: string | null;

  /** Set when the asset must be swapped — an expired grant, or a withdrawn one. */
  @Prop({ type: Boolean, required: true, default: false })
  replacementRequired!: boolean;
}

export type MediaRights = HydratedDocument<MediaRightsDocument>;

export const MediaRightsSchema =
  SchemaFactory.createForClass(MediaRightsDocument);

/**
 * One asset, one rights record.
 *
 * Unique so an upsert is an update rather than a second opinion: two rows for
 * one asset would mean two answers to "may we publish this", and nothing would
 * say which was right.
 */
MediaRightsSchema.index({ assetUrl: 1 }, { unique: true });
