import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class ImageDownloadService {
  private readonly maxBytes = 10 * 1024 * 1024;
  private readonly timeoutMs = 15_000;

  constructor(private readonly config: ConfigService) {}

  absolutePath(localPath: string) {
    const uploadsRoot =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    return join(uploadsRoot, localPath);
  }

  async download(sourceUrl: string, nameHint = 'image') {
    const source = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(source.protocol)) {
      throw new Error('Unsupported image URL protocol');
    }

    const response = await fetch(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'User-Agent': 'LammahQuiz/1.0 (question image retrieval)' },
    });
    if (!response.ok)
      throw new Error(`Image download returned HTTP ${response.status}`);

    const contentType =
      response.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
    const extension = MIME_EXTENSIONS[contentType];
    if (!extension)
      throw new Error(
        `Unsupported image MIME type: ${contentType || 'missing'}`,
      );

    const declaredSize = Number(response.headers.get('content-length'));
    if (declaredSize > this.maxBytes)
      throw new Error('Image exceeds 10 MB limit');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('Downloaded image is empty');
    if (bytes.length > this.maxBytes)
      throw new Error('Image exceeds 10 MB limit');

    const safeName =
      nameHint
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'image';
    const fileName = `${safeName}-${randomUUID()}${extension || extname(source.pathname)}`;
    const uploadsRoot =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const directory = join(uploadsRoot, 'question-assets', 'images');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), bytes, { flag: 'wx' });

    return {
      localPath: join('question-assets', 'images', fileName),
      url: `/uploads/question-assets/images/${fileName}`,
    };
  }
}
