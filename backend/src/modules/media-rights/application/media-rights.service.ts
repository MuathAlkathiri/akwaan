import { Injectable } from '@nestjs/common';
import {
  AffectedContentItem,
  MediaRightsRepository,
} from '../persistence/media-rights.repository';
import { MediaRightsDocument } from '../schemas/media-rights.schema';
import {
  ClearanceView,
  attributionRequiredFor,
  clearanceView,
} from '../domain/media-rights.policy';

/** What a caller may see. Evidence and internal notes are deliberately absent. */
export interface MediaRightsStatus extends ClearanceView {
  assetUrl: string;
  /** Deterministic display form. Derived, never stored. */
  storageKey: string;
  recordExists: boolean;
  replacementRequired: boolean;
  attribution: {
    required: boolean | null;
    text: string | null;
    sourceUrl: string | null;
    licenceUrl: string | null;
  };
}

@Injectable()
export class MediaRightsService {
  constructor(private readonly repository: MediaRightsRepository) {}

  /** `/uploads/a/b.jpg` -> `uploads/a/b.jpg`. The only place the form is produced. */
  static storageKeyOf(assetUrl: string): string {
    return assetUrl.startsWith('/') ? assetUrl.slice(1) : assetUrl;
  }

  private project(
    assetUrl: string,
    record: MediaRightsDocument | null,
    now: Date,
  ): MediaRightsStatus {
    const view = clearanceView(record, now);
    return {
      assetUrl,
      storageKey: MediaRightsService.storageKeyOf(assetUrl),
      recordExists: Boolean(record),
      replacementRequired: record?.replacementRequired ?? false,
      attribution: {
        required: record?.attribution?.required ?? null,
        text: record?.attribution?.text ?? null,
        sourceUrl: record?.attribution?.sourceUrl ?? null,
        licenceUrl: record?.attribution?.licenceUrl ?? null,
      },
      ...view,
    };
  }

  /**
   * Clearance for one asset.
   *
   * A missing record is not an error: it reads as `UNKNOWN` on both layers and
   * is therefore not production-ready. That is the honest answer — nothing is
   * known about the asset — and it keeps the absent case on the same code path
   * as the blocked one.
   */
  async statusFor(assetUrl: string, now = new Date()): Promise<MediaRightsStatus> {
    const record = await this.repository.findByAssetUrl(assetUrl);
    return this.project(assetUrl, record, now);
  }

  /** The same derivation for many assets, in one query. */
  async statusForMany(
    assetUrls: string[],
    now = new Date(),
  ): Promise<MediaRightsStatus[]> {
    const records = await this.repository.findManyByAssetUrl(assetUrls);
    return assetUrls.map((url) =>
      this.project(url, records.get(url) ?? null, now),
    );
  }

  /**
   * Record or update evidence for one asset.
   *
   * Attribution is settled here rather than taken on trust: where the licence
   * determines it, it is derived and marked as derived; otherwise the caller's
   * evidence-backed value stands and is marked as such. A boolean copied from an
   * older authoring ledger never becomes the source of truth — two such ledgers
   * already disagreed about one asset.
   */
  async record(
    assetUrl: string,
    patch: Partial<MediaRightsDocument>,
    reviewedBy?: string,
  ): Promise<MediaRightsStatus> {
    const next: Partial<MediaRightsDocument> = { ...patch };

    const derived = attributionRequiredFor(
      patch.assetRights?.basisType ?? undefined,
      patch.assetRights?.licence ?? undefined,
    );
    const attribution = { ...(patch.attribution ?? {}) } as NonNullable<
      MediaRightsDocument['attribution']
    >;
    if (derived !== undefined) {
      attribution.required = derived;
      attribution.requirementBasis = 'derived-from-licence';
    } else if (attribution.required !== undefined && attribution.required !== null) {
      attribution.requirementBasis = 'evidence';
    }
    next.attribution = attribution;

    if (reviewedBy) {
      next.reviewedBy = reviewedBy;
      next.reviewedAt = new Date();
    }

    const saved = await this.repository.upsert(assetUrl, next);
    return this.project(assetUrl, saved, new Date());
  }

  affectedContentItems(assetUrl: string): Promise<AffectedContentItem[]> {
    return this.repository.affectedContentItems(assetUrl);
  }
}
