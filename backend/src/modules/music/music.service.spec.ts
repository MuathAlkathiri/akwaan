import { ConfigService } from '@nestjs/config';
import { MusicService } from './music.service';
import { MusicTrackPolicy } from './policies/music-track.policy';
import {
  QuestionSource,
  QuestionType,
} from '../questions/schemas/question.schema';

describe('MusicService', () => {
  const original = {
    filename: 'track.mp3',
    absolutePath: '/uploads/original.mp3',
    url: '/uploads/music/originals/track.mp3',
  };
  const snippet = {
    filename: 'track-snippet.mp3',
    absolutePath: '/uploads/snippet.mp3',
    url: '/uploads/music/snippets/track-snippet.mp3',
  };

  function createService(
    overrides: { question?: Record<string, unknown>; createError?: Error } = {},
  ) {
    const storage = {
      saveOriginal: jest.fn().mockResolvedValue(original),
      allocateSnippet: jest.fn().mockResolvedValue(snippet),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const questions = {
      findMusicQuestionById: jest.fn().mockResolvedValue(overrides.question),
    };
    const tracks = {
      create: overrides.createError
        ? jest.fn().mockRejectedValue(overrides.createError)
        : jest.fn(),
    };
    const service = new MusicService(
      { get: jest.fn() } as unknown as ConfigService,
      {
        inferMetadata: jest.fn().mockResolvedValue({ title: 'Song' }),
      } as never,
      tracks as never,
      questions as never,
      {} as never,
      storage as never,
      { audioDurationSeconds: jest.fn().mockResolvedValue(60) } as never,
      { createMp3Snippet: jest.fn().mockResolvedValue(undefined) } as never,
      new MusicTrackPolicy(),
    );
    return { service, storage };
  }

  it('cleans original and snippet files when persistence fails', async () => {
    const failure = new Error('database unavailable');
    const { service, storage } = createService({ createError: failure });
    await expect(
      service.createFromUpload(
        {
          originalname: 'song.mp3',
          mimetype: 'audio/mpeg',
          buffer: Buffer.from('audio'),
        },
        { title: 'Song' },
      ),
    ).rejects.toBe(failure);
    expect(storage.delete).toHaveBeenCalledWith(snippet);
    expect(storage.delete).toHaveBeenCalledWith(original);
  });

  it.each([
    ['الأَمَاكِن!', true],
    ['البخت', false],
  ])('preserves answer matching for %s', async (answer, isCorrect) => {
    const { service } = createService({
      question: {
        type: QuestionType.AUDIO,
        source: QuestionSource.MUSIC,
        mediaUrl: '/uploads/snippet.mp3',
        answer: 'الأماكن',
      },
    });
    await expect(
      service.validateAnswer('507f1f77bcf86cd799439011', answer),
    ).resolves.toMatchObject({ isCorrect });
  });
});
