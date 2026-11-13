import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentAddressedStorageError,
  LocalImageStorageService,
} from '../../../common/uploads/local-image-storage.service';
import {
  ImageInspectionError,
  inspectImageBytes,
} from '../../../infrastructure/media/image-bytes.inspector';
import { RemoteDestinationError } from '../../../infrastructure/media/remote-image-destination.guard';
import {
  ImageDownloadService,
  ImageFetchError,
} from '../../ai-agent/infrastructure/assets/image-download.service';
import {
  CandidateMediaAsset,
  CandidateMediaProvenance,
  CandidateMediaRights,
} from '../domain/candidate-media-plan';
import { resolveEngineMediaFlags } from '../domain/engine-media-flags';

/** The Engine image limit: the same 5 MB every World Content upload is held to. */
export const ENGINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Where engine images live: the final World Content location, so nothing moves at approval. */
export const ENGINE_IMAGE_DIRECTORY = ['world-content', 'content-items'];
export const ENGINE_IMAGE_FILENAME_PREFIX = 'engine';

/**
 * Local development may opt out of the R2 requirement explicitly. Absent
 * means required: a durable mirror is the default, not an extra.
 */
export const ENGINE_MEDIA_REQUIRE_OBJECT_STORAGE =
  'ENGINE_MEDIA_REQUIRE_OBJECT_STORAGE';

export type EngineImageIngestionResult =
  | {
      status: 'resolved';
      asset: Required<
        Pick<
          CandidateMediaAsset,
          'url' | 'mimetype' | 'width' | 'height' | 'sha256'
        >
      >;
      provenance: CandidateMediaProvenance;
      /** Retrieval never establishes rights. */
      rights: CandidateMediaRights;
      storage: {
        objectKey: string;
        mirrored: boolean;
        reusedLocalFile: boolean;
      };
    }
  | {
      status: 'failed';
      failureReason: string;
      detail: string;
    };

type ProvenanceInput = Pick<
  CandidateMediaProvenance,
  'provider' | 'licenceNote' | 'derivedFromSlot' | 'model' | 'reservationId'
>;

/**
 * Turns an image — fetched from an untrusted URL or provided as bytes — into
 * a verified, durably stored, content-addressed candidate asset.
 *
 * It creates no ContentItem and writes no database record: the result is the
 * evidence a later stage writes into a candidate's `mediaPlan`. Expected
 * failures are returned as `failed` with a stable reason code, never thrown,
 * so a caller cannot mistake an exception path for a resolved slot.
 *
 * Not wired into the orchestrator yet (§30.22 Phase 3). Remote retrieval is
 * additionally refused unless media enrichment is switched on.
 */
@Injectable()
export class EngineImageIngestionService {
  constructor(
    private readonly config: ConfigService,
    private readonly downloader: ImageDownloadService,
    private readonly storage: LocalImageStorageService,
  ) {}

  async ingestRemote(input: {
    url: string;
    provenance: ProvenanceInput;
    now?: Date;
  }): Promise<EngineImageIngestionResult> {
    if (!resolveEngineMediaFlags(this.config).enrichment) {
      return {
        status: 'failed',
        failureReason: 'MEDIA_ENRICHMENT_DISABLED',
        detail:
          'remote image retrieval requires media enrichment to be enabled',
      };
    }
    try {
      const fetched = await this.downloader.fetchImage(input.url, {
        maxBytes: ENGINE_IMAGE_MAX_BYTES,
      });
      return await this.store(fetched.bytes, fetched.image, {
        acquisition: 'retrieve',
        ...input.provenance,
        sourceUrl: input.url,
        requestedUrl: fetched.requestedUrl,
        finalUrl: fetched.finalUrl,
        redirects: fetched.redirects,
        responseContentType: fetched.contentType,
        retrievedAt: (input.now ?? new Date()).toISOString(),
        byteSize: fetched.bytes.length,
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** For bytes already in hand (an Admin upload override, a generated image). */
  async ingestBytes(input: {
    bytes: Buffer;
    acquisition: 'upload' | 'generate' | 'edit';
    provenance: ProvenanceInput & { sourceUrl?: string };
    now?: Date;
  }): Promise<EngineImageIngestionResult> {
    try {
      const image = inspectImageBytes(input.bytes, {
        maxBytes: ENGINE_IMAGE_MAX_BYTES,
      });
      return await this.store(input.bytes, image, {
        acquisition: input.acquisition,
        ...input.provenance,
        retrievedAt: (input.now ?? new Date()).toISOString(),
        byteSize: input.bytes.length,
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  private async store(
    bytes: Buffer,
    image: {
      mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
      extension: '.jpg' | '.png' | '.webp';
      width: number;
      height: number;
    },
    provenance: CandidateMediaProvenance,
  ): Promise<EngineImageIngestionResult> {
    const stored = await this.storage.saveContentAddressed(bytes, {
      directory: ENGINE_IMAGE_DIRECTORY,
      filenamePrefix: ENGINE_IMAGE_FILENAME_PREFIX,
      extension: image.extension,
      mimetype: image.mimetype,
      requireObjectStorage: this.requireObjectStorage(),
    });
    return {
      status: 'resolved',
      asset: {
        url: stored.url,
        mimetype: image.mimetype,
        width: image.width,
        height: image.height,
        sha256: stored.sha256,
      },
      provenance,
      rights: { status: 'UNKNOWN', source: 'unrecorded' },
      storage: {
        objectKey: stored.objectKey,
        mirrored: stored.mirrored,
        reusedLocalFile: stored.reusedLocalFile,
      },
    };
  }

  private requireObjectStorage(): boolean {
    const raw = this.config
      .get<string>(ENGINE_MEDIA_REQUIRE_OBJECT_STORAGE)
      ?.trim()
      .toLowerCase();
    return !['false', '0', 'no', 'off'].includes(raw ?? '');
  }

  private failure(error: unknown): EngineImageIngestionResult {
    if (
      error instanceof RemoteDestinationError ||
      error instanceof ImageFetchError ||
      error instanceof ImageInspectionError ||
      error instanceof ContentAddressedStorageError
    ) {
      return {
        status: 'failed',
        failureReason: error.code,
        detail: error.message,
      };
    }
    return {
      status: 'failed',
      failureReason: 'MEDIA_INGESTION_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
