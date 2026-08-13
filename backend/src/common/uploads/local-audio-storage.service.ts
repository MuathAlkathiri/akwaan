import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { extname, join } from 'path';

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
  constructor(private readonly config: ConfigService) {}

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

  async delete(stored?: Pick<StoredLocalAudio, 'absolutePath'>): Promise<void> {
    if (stored?.absolutePath) await rm(stored.absolutePath, { force: true });
  }

  private async write(directory: string, filename: string, buffer: Buffer) {
    const stored = await this.location(directory, filename, true);
    await writeFile(stored.absolutePath, buffer);
    return stored;
  }

  private async location(
    directory: string,
    filename: string,
    createDir: boolean,
  ) {
    const root =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const absoluteDirectory = join(root, directory);
    if (createDir) await mkdir(absoluteDirectory, { recursive: true });
    return {
      filename,
      absolutePath: join(absoluteDirectory, filename),
      url: `/uploads/${directory}/${filename}`,
    };
  }
}
