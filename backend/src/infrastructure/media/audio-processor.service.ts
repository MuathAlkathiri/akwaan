import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { access, rm } from 'fs/promises';
import { MediaCommandRunnerService } from './media-command-runner.service';

@Injectable()
export class AudioProcessorService {
  constructor(private readonly commands: MediaCommandRunnerService) {}

  async createMp3Snippet(input: {
    inputPath: string;
    outputPath: string;
    startSecond: number;
    durationSeconds: number;
  }): Promise<void> {
    try {
      await this.commands.run('ffmpeg', [
        '-y',
        '-ss',
        String(input.startSecond),
        '-i',
        input.inputPath,
        '-t',
        String(input.durationSeconds),
        '-vn',
        '-acodec',
        'libmp3lame',
        '-ar',
        '44100',
        '-ac',
        '2',
        input.outputPath,
      ]);
      await access(input.outputPath);
    } catch (error) {
      await rm(input.outputPath, { force: true }).catch(() => undefined);
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException({
        code: 'SNIPPET_GENERATION_FAILED',
        message: 'Audio snippet generation failed',
      });
    }
  }

  async createMp4Snippet(input: {
    inputPath: string;
    outputPath: string;
    startSecond: number;
    durationSeconds: number;
  }): Promise<void> {
    try {
      await this.commands.run('ffmpeg', [
        '-y',
        '-ss',
        String(input.startSecond),
        '-i',
        input.inputPath,
        '-t',
        String(input.durationSeconds),
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        input.outputPath,
      ]);
      await access(input.outputPath);
    } catch (error) {
      await rm(input.outputPath, { force: true }).catch(() => undefined);
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException({
        code: 'VIDEO_CLIP_GENERATION_FAILED',
        message: 'Video clip generation failed',
      });
    }
  }
}
