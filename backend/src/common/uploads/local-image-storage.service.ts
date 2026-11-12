import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  DisabledMediaObjectStorage,
  MEDIA_OBJECT_STORAGE,
  type MediaObjectStorage,
} from './media-object-storage';

export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredLocalImage {
  filename: string;
  path: string;
  url: string;
  mimetype: string;
  size: number;
}

interface SaveLocalImageOptions {
  directory: string[];
  filenamePrefix: string;
}

export interface SaveContentAddressedImageOptions {
  directory: string[];
  /**
   * The filename is `<prefix>-<sha256><extension>`. Restricted to the prefixes
   * the delete guard protects, so a stored shared file can never be deleted.
   */
  filenamePrefix: ContentAddressedPrefix;
  extension: '.jpg' | '.png' | '.webp';
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
  /**
   * Refuse to store when the object-storage mirror is off. A host with an
   * ephemeral disk would otherwise hand back a URL that dies on restart.
   */
  requireObjectStorage: boolean;
}

export interface StoredContentAddressedImage extends StoredLocalImage {
  sha256: string;
  objectKey: string;
  /** True when identical bytes were already on local disk. */
  reusedLocalFile: boolean;
  mirrored: boolean;
}

export type ContentAddressedStorageCode =
  | 'STORAGE_NOT_DURABLE'
  | 'STORAGE_LOCAL_WRITE_FAILED'
  | 'STORAGE_MIRROR_WRITE_FAILED'
  | 'STORAGE_INVALID_REQUEST';

export class ContentAddressedStorageError extends Error {
  constructor(
    readonly code: ContentAddressedStorageCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ContentAddressedStorageError';
  }
}

/**
 * The only filename prefixes content-addressed storage may issue. The delete
 * guard below protects exactly these, so a `<name>-<sha256>` file written by
 * anything else stays deletable by its own record's cleanup.
 */
export const CONTENT_ADDRESSED_PREFIXES = ['engine'] as const;
export type ContentAddressedPrefix =
  (typeof CONTENT_ADDRESSED_PREFIXES)[number];

/**
 * Content-addressed files are shared: identical bytes from two candidates are
 * one file. No per-record cleanup may delete them, because another record may
 * still point at the same URL. The match is the whole filename — a registered
 * prefix, a hyphen, exactly 64 lower-case hex digits and a supported
 * extension — so no legacy timestamped or UUID name can satisfy it.
 */
const CONTENT_ADDRESSED_FILENAME = new RegExp(
  `(^|[\\\\/])(${CONTENT_ADDRESSED_PREFIXES.join('|')})-[0-9a-f]{64}\\.(jpg|png|webp)$`,
);

export const isContentAddressedImagePath = (path: string): boolean =>
  CONTENT_ADDRESSED_FILENAME.test(path);

@Injectable()
export class LocalImageStorageService {
  private static readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  private static readonly ALLOWED_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ];
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];

  constructor(
    private readonly configService: ConfigService,
    // Nest always injects this; the default only serves direct construction in
    // unit tests that exercise validation and never touch the mirror.
    @Inject(MEDIA_OBJECT_STORAGE)
    private readonly objectStorage: MediaObjectStorage = new DisabledMediaObjectStorage(),
  ) {}

  async save(
    file: UploadedImageFile,
    options: SaveLocalImageOptions,
  ): Promise<StoredLocalImage> {
    this.validate(file);

    const uploadsRoot = this.getUploadsRoot();
    const relativeDir = join(...options.directory);
    const absoluteDir = join(uploadsRoot, relativeDir);
    await mkdir(absoluteDir, { recursive: true });

    const extension = extname(file.originalname).toLowerCase();
    const filename = `${options.filenamePrefix}-${Date.now()}-${randomBytes(
      6,
    ).toString('hex')}${extension}`;
    const relativePath = join('uploads', relativeDir, filename).replace(
      /\\/g,
      '/',
    );
    const absolutePath = join(absoluteDir, filename);

    await writeFile(absolutePath, file.buffer);

    // Mirror before returning: the caller persists this URL, so an object that
    // only exists on an ephemeral disk would become a broken reference the
    // first time the host restarts.
    const objectKey = `${relativeDir}/${filename}`.replace(/\\/g, '/');
    await this.objectStorage.put(objectKey, file.buffer, file.mimetype);

    return {
      filename,
      path: relativePath,
      url: `/${relativePath}`,
      mimetype: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Stores bytes under a name derived from their SHA-256, so a retry or a
   * second candidate with the same image lands on the same file and the same
   * object key. Existing `save` callers keep their timestamped names.
   *
   * Durability is part of success: the object-storage put must succeed before
   * this returns, so a caller can never record a URL for bytes that only exist
   * on a disk that may vanish. On failure nothing is deleted; the local copy is
   * harmless, unreferenced, and reused by the retry.
   */
  async saveContentAddressed(
    bytes: Buffer,
    options: SaveContentAddressedImageOptions,
  ): Promise<StoredContentAddressedImage> {
    if (
      !(CONTENT_ADDRESSED_PREFIXES as readonly string[]).includes(
        options.filenamePrefix,
      )
    ) {
      throw new ContentAddressedStorageError(
        'STORAGE_INVALID_REQUEST',
        `filenamePrefix must be one of: ${CONTENT_ADDRESSED_PREFIXES.join(', ')}`,
      );
    }
    if (
      !options.directory.length ||
      options.directory.some(
        (segment) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment),
      )
    ) {
      throw new ContentAddressedStorageError(
        'STORAGE_INVALID_REQUEST',
        'directory segments must be lower-case slugs',
      );
    }
    if (!bytes?.length) {
      throw new ContentAddressedStorageError(
        'STORAGE_INVALID_REQUEST',
        'cannot store an empty file',
      );
    }
    if (options.requireObjectStorage && !this.objectStorage.enabled) {
      throw new ContentAddressedStorageError(
        'STORAGE_NOT_DURABLE',
        'object storage is not configured; refusing a non-durable asset',
      );
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const filename = `${options.filenamePrefix}-${sha256}${options.extension}`;
    const relativeDir = options.directory.join('/');
    const absoluteDir = join(this.getUploadsRoot(), ...options.directory);
    const absolutePath = join(absoluteDir, filename);
    const objectKey = `${relativeDir}/${filename}`;

    let reusedLocalFile = false;
    try {
      await mkdir(absoluteDir, { recursive: true });
      const existing = await readFile(absolutePath).catch(() => null);
      if (
        existing &&
        createHash('sha256').update(existing).digest('hex') === sha256
      ) {
        reusedLocalFile = true;
      } else {
        // Write-then-rename, so a crash mid-write never leaves a partial file
        // under the final name, and a corrupt leftover is replaced whole.
        const temporary = `${absolutePath}.${randomBytes(6).toString('hex')}.tmp`;
        try {
          await writeFile(temporary, bytes, { flag: 'wx' });
          await rename(temporary, absolutePath);
        } catch (error) {
          await rm(temporary, { force: true }).catch(() => undefined);
          throw error;
        }
      }
    } catch (error) {
      throw new ContentAddressedStorageError(
        'STORAGE_LOCAL_WRITE_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }

    // Always put, even when the local file existed: the earlier attempt may
    // have written locally and then failed to mirror. Same key, same bytes.
    if (this.objectStorage.enabled) {
      try {
        await this.objectStorage.put(objectKey, bytes, options.mimetype);
      } catch (error) {
        throw new ContentAddressedStorageError(
          'STORAGE_MIRROR_WRITE_FAILED',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const relativePath = `uploads/${objectKey}`;
    return {
      filename,
      path: relativePath,
      url: `/${relativePath}`,
      mimetype: options.mimetype,
      size: bytes.length,
      sha256,
      objectKey,
      reusedLocalFile,
      mirrored: this.objectStorage.enabled,
    };
  }

  async delete(file?: Pick<StoredLocalImage, 'path'>): Promise<void> {
    if (!file?.path) return;
    // Shared, content-addressed files outlive any one record that uses them.
    if (isContentAddressedImagePath(file.path)) return;

    const uploadsRoot = this.getUploadsRoot();
    const relativePath = file.path.replace(/^\/?uploads[\\/]/, '');
    const absolutePath = join(uploadsRoot, relativePath);

    await rm(absolutePath, { force: true }).catch(() => undefined);
    await this.objectStorage.remove(relativePath);
  }

  validate(file: UploadedImageFile): void {
    const extension = extname(file.originalname).toLowerCase();

    if (!LocalImageStorageService.ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(
        'Banner must be a jpg, jpeg, png, or webp image',
      );
    }

    if (!LocalImageStorageService.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Banner must be an image file');
    }

    if (file.size > LocalImageStorageService.MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Banner image must be 5MB or smaller');
    }
  }

  private getUploadsRoot(): string {
    return (
      this.configService.get<string>('UPLOADS_DIR') ??
      join(process.cwd(), 'uploads')
    );
  }
}
