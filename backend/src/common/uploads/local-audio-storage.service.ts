import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { extname, join, relative } from 'path';
import {
  MEDIA_OBJECT_STORAGE,
  type MediaObjectStorage,
} from './media-object-storage';

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export interface UploadedAudioFile {
  originalname: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
}

export type QuestionMediaType = 'audio' | 'video';

export interface StoredLocalAudio {
  filename: string;
  absolutePath: string;
  url: string;
}

@Injectable()
export class LocalAudioStorageService {
  private readonly logger = new Logger(LocalAudioStorageService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(MEDIA_OBJECT_STORAGE)
    private readonly objectStorage: MediaObjectStorage,
  ) {}

  async saveOriginal(file: UploadedAudioFile): Promise<StoredLocalAudio> {
    const extension = extname(file.originalname).toLowerCase();
    return this.write(
      'music/originals',
      `${randomUUID()}${extension}`,
      file.buffer,
    );
  }

  async saveQuestionAudio(file: UploadedAudioFile): Promise<StoredLocalAudio> {
    return this.saveQuestionMedia(file, 'audio');
  }

  async saveQuestionMedia(
    file: UploadedAudioFile,
    type: QuestionMediaType,
  ): Promise<StoredLocalAudio> {
    const extension =
      extname(file.originalname).toLowerCase() ||
      (type === 'video' ? '.mp4' : '.m4a');
    return this.write(
      `question-assets/${type}`,
      `${randomUUID()}${extension}`,
      file.buffer,
    );
  }

  async allocateSnippet(originalFilename: string): Promise<StoredLocalAudio> {
    const stem = originalFilename.replace(/\.[^.]+$/, '');
    return this.location('music/snippets', `${stem}-snippet.mp3`, true);
  }

  async allocateQuestionSnippet(
    originalFilename: string,
  ): Promise<StoredLocalAudio> {
    return this.allocateQuestionMediaClip(originalFilename, 'audio');
  }

  async allocateQuestionMediaClip(
    originalFilename: string,
    type: QuestionMediaType,
  ): Promise<StoredLocalAudio> {
    const stem = originalFilename.replace(/\.[^.]+$/, '');
    return this.location(
      `question-assets/${type}`,
      `${stem}-clip.${type === 'video' ? 'mp4' : 'mp3'}`,
      true,
    );
  }

  /**
   * Mirror a file that ffmpeg produced in place.
   *
   * The snippet pipelines allocate a path, hand it to ffmpeg as an output
   * target, and never see the bytes. Those derived clips are what gameplay
   * actually plays, so they need the same durability as a direct upload —
   * hence an explicit publish step once the encoder has finished.
   */
  async publish(
    stored?: Pick<StoredLocalAudio, 'absolutePath'>,
  ): Promise<void> {
    if (!stored?.absolutePath || !this.objectStorage.enabled) return;

    const key = this.keyFor(stored.absolutePath);
    if (!key) return;

    try {
      const body = await readFile(stored.absolutePath);
      await this.objectStorage.put(key, body, contentTypeFor(key));
    } catch (error) {
      // Surfaced rather than thrown: the local copy is already usable, and
      // failing the admin request here would roll back a completed encode.
      this.logger.error(
        `Failed to mirror ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async delete(stored?: Pick<StoredLocalAudio, 'absolutePath'>): Promise<void> {
    if (!stored?.absolutePath) return;
    await rm(stored.absolutePath, { force: true });

    const key = this.keyFor(stored.absolutePath);
    if (key) await this.objectStorage.remove(key);
  }

  private async write(directory: string, filename: string, buffer: Buffer) {
    const stored = await this.location(directory, filename, true);
    await writeFile(stored.absolutePath, buffer);
    await this.objectStorage.put(
      `${directory}/${filename}`,
      buffer,
      contentTypeFor(filename),
    );
    return stored;
  }

  /** The uploads-relative key, or undefined for a path outside the root. */
  private keyFor(absolutePath: string): string | undefined {
    const key = relative(this.root(), absolutePath).replace(/\\/g, '/');
    return key && !key.startsWith('..') ? key : undefined;
  }

  private root(): string {
    return (
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads')
    );
  }

  private async location(
    directory: string,
    filename: string,
    createDir: boolean,
  ) {
    const absoluteDirectory = join(this.root(), directory);
    if (createDir) await mkdir(absoluteDirectory, { recursive: true });
    return {
      filename,
      absolutePath: join(absoluteDirectory, filename),
      url: `/uploads/${directory}/${filename}`,
    };
  }
}

function contentTypeFor(pathOrKey: string): string | undefined {
  return MEDIA_CONTENT_TYPES[extname(pathOrKey).toLowerCase()];
}
