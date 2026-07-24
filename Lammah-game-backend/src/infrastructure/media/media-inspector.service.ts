import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { MediaCommandRunnerService } from './media-command-runner.service';

@Injectable()
export class MediaInspectorService {
  constructor(private readonly commands: MediaCommandRunnerService) {}

  async audioDurationSeconds(filePath: string): Promise<number> {
    return this.mediaDurationSeconds(filePath, 'audio');
  }

  async videoDurationSeconds(filePath: string): Promise<number> {
    const stream = await this.commands.run('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    if (stream.trim() !== 'video')
      throw new UnprocessableEntityException({
        code: 'INVALID_VIDEO_FILE',
        message: 'The uploaded file does not contain a video stream',
      });
    return this.mediaDurationSeconds(filePath, 'video');
  }

  private async mediaDurationSeconds(
    filePath: string,
    type: 'audio' | 'video',
  ): Promise<number> {
    const stdout = await this.commands.run('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new UnprocessableEntityException({
        code: type === 'video' ? 'INVALID_VIDEO_FILE' : 'INVALID_AUDIO_FILE',
        message: `The uploaded file is not valid ${type}`,
      });
    }
    return Math.round(duration * 100) / 100;
  }
}
