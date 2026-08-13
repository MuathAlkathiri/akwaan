import { evaluateAssetRelevance } from '../contracts/asset-relevance';

describe('asset relevance policy', () => {
  const characterRequest = {
    type: 'image' as const,
    gameMode: 'identifyCharacter' as const,
    entity: 'Rock Lee',
    franchise: 'Naruto',
    entityType: 'character',
  };

  it('rejects a real-person name collision even when the title matches', () => {
    const result = evaluateAssetRelevance(characterRequest, {
      provider: 'wikimedia',
      assetType: 'image',
      title: 'Rock Lee',
      description: 'American singer and musician born in 1982',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionCodes).toContain('LIKELY_NAME_COLLISION');
    expect(result.rejectionCodes).toContain('INSUFFICIENT_FRANCHISE_EVIDENCE');
  });

  it('requires exact song and artist evidence and rejects altered versions', () => {
    const request = {
      type: 'audio' as const,
      mediaIntent: 'music' as const,
      entity: 'الأماكن',
      aliases: ['الاماكن'],
      artist: 'محمد عبده',
      artistAliases: ['Mohammed Abdu'],
    };
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'محمد عبده - الأماكن | official audio',
      }).accepted,
    ).toBe(true);
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'محمد عبده - مذهلة | official audio',
      }).rejectionCodes,
    ).toContain('MUSIC_TITLE_ARTIST_MISMATCH');
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'الأماكن - فنان آخر cover remix',
      }).rejectionCodes,
    ).toEqual(
      expect.arrayContaining([
        'MUSIC_TITLE_ARTIST_MISMATCH',
        'MUSIC_COVER_VERSION_REJECTED',
        'MUSIC_REMIX_REJECTED',
      ]),
    );
  });

  it('accepts the character only with entity and franchise context', () => {
    const result = evaluateAssetRelevance(characterRequest, {
      provider: 'wikimedia',
      assetType: 'image',
      title: 'Rock Lee',
      description: 'Fictional ninja character in the Naruto anime and manga',
    });
    expect(result.accepted).toBe(true);
  });

  it('allows franchise evidence for a decorative cover but not a primary character image', () => {
    const candidate = {
      provider: 'wikimedia',
      assetType: 'image' as const,
      title: 'Naruto',
      description: 'Japanese anime and manga series',
    };
    expect(evaluateAssetRelevance(characterRequest, candidate).accepted).toBe(
      false,
    );
    expect(
      evaluateAssetRelevance(
        { ...characterRequest, purpose: 'decorative' },
        candidate,
      ).accepted,
    ).toBe(true);
  });

  it('rejects soundtrack results for voice and accepts dialogue scenes', () => {
    const request = {
      type: 'audio' as const,
      mediaIntent: 'voice' as const,
      entity: 'Kakashi Hatake',
      franchise: 'Naruto',
    };
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'Naruto Kakashi OST soundtrack',
      }).rejectionCodes,
    ).toContain('MEDIA_INTENT_MISMATCH');
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'Naruto Kakashi Hatake funny voice scene dialogue',
      }).accepted,
    ).toBe(true);
  });

  it('rejects generic context and another character for a Jiraiya voice request', () => {
    const request = {
      type: 'audio' as const,
      gameMode: 'identifyVoice' as const,
      mediaIntent: 'voice' as const,
      entity: 'Jiraiya',
      localizedName: 'جيرايا',
      franchise: 'Naruto',
      context: 'motivational speech',
    };
    const generic = evaluateAssetRelevance(request, {
      provider: 'youtube',
      assetType: 'audio',
      title: 'Best anime motivational speech compilation',
      description: 'Motivational speech collection',
    });
    expect(generic.rejectionCodes).toEqual(
      expect.arrayContaining([
        'VOICE_ENTITY_EVIDENCE_MISSING',
        'VOICE_CONTEXT_ONLY_RESULT',
        'VOICE_FRANCHISE_MISMATCH',
      ]),
    );
    const kakashi = evaluateAssetRelevance(request, {
      provider: 'youtube',
      assetType: 'audio',
      title: 'Kakashi voice scene',
      description: 'Naruto dialogue',
    });
    expect(kakashi.rejectionCodes).toContain('VOICE_ENTITY_EVIDENCE_MISSING');
    const jiraiya = evaluateAssetRelevance(request, {
      provider: 'youtube',
      assetType: 'audio',
      title: 'Jiraiya voice lines Naruto',
      description: 'Jiraiya speech scene compilation',
    });
    expect(jiraiya.accepted).toBe(true);
  });

  it.each([
    'Kakashi Hatake voice lines Naruto',
    'Naruto Kakashi Hatake best moments',
    'Kakashi Hatake funny scenes Naruto Shippuden',
    'Hatake Kakashi quotes Naruto',
  ])('accepts entity-specific scene metadata: %s', (title) => {
    expect(
      evaluateAssetRelevance(
        {
          type: 'audio',
          mediaIntent: 'voice',
          entity: 'Kakashi Hatake',
          aliases: ['Hatake Kakashi'],
          franchise: 'Naruto',
        },
        { provider: 'youtube', assetType: 'audio', title },
      ).accepted,
    ).toBe(true);
  });

  it.each([
    'Naruto OST Kakashi Hatake theme',
    'Kakashi Hatake AMV edit Naruto',
    'Kakashi Hatake reaction analysis Naruto',
  ])('critically rejects music/edit metadata: %s', (title) => {
    const result = evaluateAssetRelevance(
      {
        type: 'audio',
        mediaIntent: 'voice',
        entity: 'Kakashi Hatake',
        franchise: 'Naruto',
      },
      { provider: 'youtube', assetType: 'audio', title },
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectionCodes).toContain('VOICE_VIDEO_MUSIC_METADATA');
  });

  it('rejects dialogue for music and accepts official audio', () => {
    const request = {
      type: 'audio' as const,
      mediaIntent: 'music' as const,
      title: 'Blue Bird',
    };
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'Blue Bird anime dialogue scene',
      }).accepted,
    ).toBe(false);
    expect(
      evaluateAssetRelevance(request, {
        provider: 'youtube',
        assetType: 'audio',
        title: 'Blue Bird official audio lyrics',
      }).accepted,
    ).toBe(true);
  });
});
