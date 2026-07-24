import { ConfigService } from '@nestjs/config';
import { YouTubeAssetProvider } from '../infrastructure/assets/youtube-asset.provider';
import { normalizeAssetRequestIntent } from '../application/asset-request-normalizer';

describe('YouTubeAssetProvider media intent', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'ALLOW_YOUTUBE_ASSET_DOWNLOADS') return 'true';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    }),
  } as unknown as ConfigService;
  const provider = new YouTubeAssetProvider(config);

  it('normalizes yt-dlp metadata without exposing provider-specific shapes', () => {
    const results = provider.parseSearchResults(
      JSON.stringify({
        id: 'abc',
        title: 'Naruto Kakashi voice scene',
        channel: 'Anime Clips',
        duration: 42,
        tags: ['dialogue'],
      }),
    );
    expect(results).toEqual([
      {
        sourceUrl: 'https://www.youtube.com/watch?v=abc',
        title: 'Naruto Kakashi voice scene',
        description: '',
        channel: 'Anime Clips',
        durationSeconds: 42,
        tags: ['dialogue'],
      },
    ]);
  });

  it('supports normalized voice and music requests', () => {
    expect(
      provider.supports({
        type: 'audio',
        provider: 'youtube',
        mediaIntent: 'voice',
        sourceType: 'anime-voice',
        entity: 'Kakashi Hatake',
      }),
    ).toBe(true);
    expect(
      provider.supports({
        type: 'audio',
        provider: 'youtube',
        mediaIntent: 'music',
        sourceType: 'song',
        title: 'Blue Bird',
      }),
    ).toBe(true);
  });

  it('never supports image requests and explains why', () => {
    expect(
      provider.support({
        type: 'image',
        provider: 'youtube',
        entity: 'Kakashi Hatake',
      }),
    ).toEqual({
      supported: false,
      reason: 'Expected audio or video request; received image',
    });
  });

  it('supports video requests with searchable entity metadata', () => {
    expect(
      provider.supports({
        type: 'video',
        provider: 'youtube',
        entity: 'Arya Stark',
        franchise: 'Game of Thrones',
      }),
    ).toBe(true);
  });

  it('uses an exact requested video start instead of the automatic window', () => {
    expect(provider.selectVideoWindowStart(600, 10, 74)).toBe(74);
    expect(provider.selectVideoWindowStart(600, 10, 120)).toBe(120);
    expect(provider.selectVideoWindowStart(600, 10)).toBe(150);
  });

  it('rejects missing media intent with a useful reason', () => {
    expect(
      provider.support({
        type: 'audio',
        provider: 'youtube',
        entity: 'Kakashi Hatake',
      }),
    ).toEqual({
      supported: false,
      reason: 'Unsupported mediaIntent: missing',
    });
  });

  it('builds voice-specific searches', () => {
    expect(
      provider.buildSearchCandidates({
        type: 'audio',
        provider: 'youtube',
        mediaIntent: 'voice',
        sourceType: 'anime-voice',
        entity: 'Kakashi Hatake',
        franchise: 'Naruto',
        language: 'Japanese',
      }),
    ).toEqual(
      expect.arrayContaining([
        'Kakashi Hatake Naruto voice',
        'Kakashi Hatake Naruto voice scene',
        'Kakashi Hatake Naruto dialogue',
        'Kakashi Hatake Naruto Japanese voice',
      ]),
    );
  });

  it('builds bounded voice windows away from long-video intros and outros', () => {
    const starts = provider.buildVoiceWindowStarts(100, 6);
    expect(starts).toEqual([10, 25, 40, 55, 70]);
    expect(starts).toHaveLength(5);
  });

  it('expands combined language preferences without making either mandatory', () => {
    const plan = provider.buildVoiceSearchPlan({
      type: 'audio',
      mediaIntent: 'voice',
      gameMode: 'identifyVoice',
      entity: 'Kakashi Hatake',
      franchise: 'Naruto',
      language: 'English/Japanese',
    });
    expect(plan.queries).toEqual(
      expect.arrayContaining([
        'Kakashi Hatake Naruto Japanese voice',
        'Kakashi Hatake Naruto English dub',
      ]),
    );
  });

  it('accepts audible windows and rejects mostly silent windows', () => {
    expect(
      provider.scoreVoiceWindow(
        25,
        6,
        'silence_duration: 0.4\nRMS level dB: -22.5\nPeak level dB: -3.2\nDynamic range: 14\nZero crossings rate: 0.08',
      ),
    ).toMatchObject({
      accepted: true,
      startSeconds: 25,
      classification: 'speech-likely',
    });
    expect(
      provider.scoreVoiceWindow(
        10,
        6,
        'silence_duration: 4.8\nRMS level dB: -55\nPeak level dB: -40',
      ),
    ).toMatchObject({ accepted: false, startSeconds: 10 });
    expect(
      provider.scoreVoiceWindow(
        40,
        6,
        'RMS level dB: -12\nPeak level dB: -1\nDynamic range: 2.5\nZero crossings rate: 0.14',
      ),
    ).toMatchObject({ accepted: false, classification: 'music-likely' });
  });

  it('keeps music searches separate from voice searches', () => {
    const searches = provider.buildSearchCandidates({
      type: 'audio',
      provider: 'youtube',
      mediaIntent: 'music',
      sourceType: 'song',
      title: 'Blue Bird',
      artist: 'Ikimono-gakari',
    });
    expect(searches).toEqual([
      'Ikimono-gakari Blue Bird official audio',
      'Ikimono-gakari Blue Bird official',
      'Ikimono-gakari Blue Bird lyrics',
      'Blue Bird Ikimono-gakari Topic',
      'Ikimono-gakari Blue Bird',
    ]);
    expect(searches.join(' ')).not.toContain('voice scene');
  });

  it('binds every Gulf song query to both title and artist', () => {
    const searches = provider.buildSearchCandidates({
      type: 'audio',
      mediaIntent: 'music',
      gameMode: 'identifySong',
      entity: 'الأماكن',
      title: 'الأماكن',
      artist: 'محمد عبده',
      aliases: ['الاماكن'],
      artistAliases: ['Mohammed Abdu'],
    });
    expect(searches.length).toBeGreaterThanOrEqual(5);
    expect(
      searches.every(
        (query) =>
          /الأماكن|الاماكن/.test(query) &&
          /محمد عبده|Mohammed Abdu/.test(query),
      ),
    ).toBe(true);
  });

  it('scores bounded mid-song windows without applying voice rejection', () => {
    expect(provider.buildMusicWindowStarts(100, 6)).toEqual([20, 35, 50, 65]);
    expect(
      provider.scoreMusicWindow(
        35,
        6,
        'RMS level dB: -18\nPeak level dB: -2\nDynamic range: 3\nZero crossings rate: 0.08',
      ),
    ).toMatchObject({ accepted: true, classification: 'music-likely' });
    expect(
      provider.scoreMusicWindow(
        20,
        6,
        'silence_duration: 5\nRMS level dB: -60\nPeak level dB: -50',
      ).accepted,
    ).toBe(false);
  });

  it('binds every identifyVoice query to a direct entity alias', () => {
    const request = {
      type: 'audio' as const,
      provider: 'youtube',
      entity: 'Jiraiya',
      localizedName: 'جيرايا',
      originalName: '自来也',
      franchise: 'Naruto',
      language: 'Japanese',
      context: 'motivational speech',
      gameMode: 'identifyVoice' as const,
      mediaIntent: 'voice' as const,
      sourceType: 'speech' as const,
    };
    const plan = provider.buildVoiceSearchPlan(request);
    expect(plan.aliases).toEqual(
      expect.arrayContaining(['Jiraiya', 'Jiraya', 'جيرايا', '自来也']),
    );
    expect(plan.queries.length).toBeGreaterThan(0);
    for (const query of plan.queries) {
      expect(
        plan.aliases.some((alias) =>
          query.toLocaleLowerCase().includes(alias.toLocaleLowerCase()),
        ),
      ).toBe(true);
    }
    expect(plan.queries).toContain('Jiraiya Naruto motivational speech scene');
    expect(plan.queries).not.toContain('motivational speech');
    expect(
      plan.queries.filter((query) => query.includes('Naruto')).length,
    ).toBeGreaterThan(plan.queries.length / 2);
  });

  it('rejects identifyVoice without an explicit entity', () => {
    expect(
      provider.support({
        type: 'audio',
        provider: 'youtube',
        gameMode: 'identifyVoice',
        mediaIntent: 'voice',
        context: 'motivational speech',
        query: 'motivational speech',
      }),
    ).toEqual({
      supported: false,
      reason: 'VOICE_ENTITY_REQUIRED: identifyVoice requires a concrete entity',
    });
    expect(
      provider.buildSearchCandidates({
        type: 'audio',
        gameMode: 'identifyVoice',
        mediaIntent: 'voice',
        context: 'motivational speech',
      }),
    ).toEqual([]);
  });

  it('normalizes game modes into provider-neutral audio semantics', () => {
    expect(
      normalizeAssetRequestIntent(
        { type: 'audio', entity: 'Kakashi', categoryType: 'anime' },
        'identifyVoice',
      ),
    ).toMatchObject({ mediaIntent: 'voice', sourceType: 'anime-voice' });
    expect(
      normalizeAssetRequestIntent(
        { type: 'audio', title: 'Blue Bird' },
        'identifySong',
      ),
    ).toMatchObject({ mediaIntent: 'music', sourceType: 'song' });
  });
});
