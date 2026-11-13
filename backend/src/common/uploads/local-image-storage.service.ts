import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
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

  async delete(file?: Pick<StoredLocalImage, 'path'>): Promise<void> {
    if (!file?.path) return;

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
