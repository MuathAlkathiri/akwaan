import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type MediaBinary = 'ffmpeg' | 'ffprobe';

@Injectable()
export class MediaCommandRunnerService {
  async run(binary: MediaBinary, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(binary, args, {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      const unavailable =
        error instanceof Error &&
        (('code' in error && error.code === 'ENOENT') ||
          error.message.includes('ENOENT'));
      throw new InternalServerErrorException({
        code: unavailable
          ? 'MEDIA_TOOL_UNAVAILABLE'
          : 'MEDIA_PROCESSING_FAILED',
        message: unavailable
          ? 'Required media processing tools are unavailable'
          : 'Media processing failed',
      });
    }
  }
}
