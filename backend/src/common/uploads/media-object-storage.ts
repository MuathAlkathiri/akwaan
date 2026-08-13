import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const MEDIA_OBJECT_STORAGE = Symbol('MEDIA_OBJECT_STORAGE');

/**
 * A durable home for the bytes that `UPLOADS_DIR` holds locally.
 *
 * The local filesystem stays the working copy everywhere — ffmpeg needs real
 * paths to read and write, and development should not need a bucket. This
 * interface is the mirror: when it is enabled, every finished file is also
 * pushed to object storage so it survives a host with an ephemeral disk.
 *
 * Keys are the path relative to the uploads root (`questions/images/x.webp`),
 * which is exactly the tail of the `/uploads/...` URLs already persisted in
 * MongoDB. Keeping them identical is what lets the BETA serve existing media
 * without rewriting a single document.
 */
export interface MediaObjectStorage {
  readonly enabled: boolean;
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Absolute URL for a key, or undefined when no public base is configured. */
  publicUrl(key: string): string | undefined;
}

export class DisabledMediaObjectStorage implements MediaObjectStorage {
  readonly enabled = false;
  async put(): Promise<void> {}
  async remove(): Promise<void> {}
  publicUrl(): undefined {
    return undefined;
  }
}

export interface R2MediaObjectStorageOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

export class R2MediaObjectStorage implements MediaObjectStorage {
  readonly enabled = true;

  private readonly logger = new Logger(R2MediaObjectStorage.name);
  private readonly client: S3Client;

  constructor(private readonly options: R2MediaObjectStorageOptions) {
    this.client = new S3Client({
      // R2 ignores the region but the S3 client requires one.
      region: 'auto',
      endpoint: options.endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: normalizeKey(key),
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: normalizeKey(key),
        }),
      );
    } catch (error) {
      // A mirror that fails to delete leaves an orphan object, which is
      // cheaper than failing the admin request that owns the record.
      this.logger.warn(
        `Failed to delete mirrored object ${key}: ${describe(error)}`,
      );
    }
  }

  publicUrl(key: string): string | undefined {
    if (!this.options.publicBaseUrl) return undefined;
    return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${normalizeKey(key)}`;
  }
}

export function normalizeKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/^\/?(uploads\/)?/, '');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Enabled only when every credential is present. A half-configured bucket must
 * not silently degrade to "writes vanish on restart" — it stays off, local
 * behaviour is unchanged, and the missing variables are named in the log.
 */
export function createMediaObjectStorage(
  config: ConfigService,
): MediaObjectStorage {
  const logger = new Logger('MediaObjectStorage');
  const accountId = config.get<string>('R2_ACCOUNT_ID')?.trim();
  const explicitEndpoint = config.get<string>('R2_ENDPOINT')?.trim();
  const bucket = config.get<string>('R2_BUCKET')?.trim();
  const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID')?.trim();
  const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY')?.trim();
  const publicBaseUrl = config.get<string>('MEDIA_PUBLIC_BASE_URL')?.trim();

  const endpoint =
    explicitEndpoint ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  const missing = [
    endpoint ? null : 'R2_ACCOUNT_ID (or R2_ENDPOINT)',
    bucket ? null : 'R2_BUCKET',
    accessKeyId ? null : 'R2_ACCESS_KEY_ID',
    secretAccessKey ? null : 'R2_SECRET_ACCESS_KEY',
  ].filter((name): name is string => name !== null);

  if (missing.length === 4) {
    logger.log('R2 mirroring disabled; uploads stay on the local filesystem');
    return new DisabledMediaObjectStorage();
  }

  if (missing.length > 0) {
    logger.error(
      `R2 mirroring is partially configured and stays disabled. Missing: ${missing.join(', ')}`,
    );
    return new DisabledMediaObjectStorage();
  }

  logger.log(`R2 mirroring enabled for bucket ${bucket}`);
  return new R2MediaObjectStorage({
    endpoint: endpoint as string,
    bucket: bucket as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    publicBaseUrl,
  });
}
