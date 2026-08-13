import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'path';
import { UploadedAudioFile } from '../../../common/uploads/local-audio-storage.service';

@Injectable()
export class MusicTrackPolicy {
  static readonly DEFAULT_SNIPPET_DURATION_SECONDS = 15;
  private static readonly MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
  private static readonly EXTENSIONS = ['.mp3', '.wav', '.m4a'];
  private static readonly MIME_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
  ];

  validateFile(file?: UploadedAudioFile): asserts file is UploadedAudioFile {
    if (!file) throw new BadRequestException('Audio file is required');
    const extension = extname(file.originalname).toLowerCase();
    if (!MusicTrackPolicy.EXTENSIONS.includes(extension)) {
      throw new BadRequestException('Only mp3, wav, and m4a files are allowed');
    }
    if (file.mimetype && !MusicTrackPolicy.MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only mp3, wav, and m4a files are allowed');
    }
    if (
      (file.size ?? file.buffer.length) > MusicTrackPolicy.MAX_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException('Audio file must be 50MB or smaller');
    }
  }

  snippetPlan(
    requestedDuration: number | undefined,
    requestedStart: number | undefined,
    totalDuration: number,
  ) {
    const duration =
      requestedDuration ?? MusicTrackPolicy.DEFAULT_SNIPPET_DURATION_SECONDS;
    if (!Number.isFinite(duration))
      throw new BadRequestException('snippetDurationSeconds must be a number');
    const snippetDurationSeconds = Math.min(Math.max(duration, 10), 20);
    const maxStart = Math.max(totalDuration - snippetDurationSeconds, 0);
    const defaultStart = totalDuration >= 30 + snippetDurationSeconds ? 30 : 0;
    return {
      snippetDurationSeconds,
      snippetStartSecond: Math.min(
        Math.max(requestedStart ?? defaultStart, 0),
        maxStart,
      ),
    };
  }
}
