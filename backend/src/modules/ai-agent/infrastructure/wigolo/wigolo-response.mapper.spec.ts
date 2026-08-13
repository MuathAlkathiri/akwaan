import { WigoloResponseMapper } from './wigolo-response.mapper';
import type { EntityVerificationRequest } from '../../application/entity-verification.types';

const songRequest: EntityVerificationRequest = {
  proposedEntity: 'الأماكن',
  proposedAnswer: 'الأماكن',
  entityType: 'song',
  artist: 'محمد عبده',
  language: 'ar',
  gameMode: 'identifySong',
  intendedAsset: 'song',
};

const animeRequest: EntityVerificationRequest = {
  proposedEntity: 'ديدارا',
  proposedAnswer: 'ديدارا',
  entityType: 'anime-character',
  franchise: 'Naruto',
  language: 'ar',
  gameMode: 'identifyImage',
  intendedAsset: 'image',
};

describe('WigoloResponseMapper', () => {
  const mapper = new WigoloResponseMapper();

  it('maps actual structured search result rows as usable evidence', () => {
    const result = mapper.map(songRequest, {
      results: [
        {
          title: 'محمد عبده - الأماكن',
          url: 'https://open.spotify.com/track/example',
          relevance_score: 0.8,
          fetched: true,
        },
        {
          title: 'Mohammed Abdo - Al Amaken',
          url: 'https://www.discogs.com/release/example',
          relevance_score: 0.7,
          fetched: true,
        },
      ],
      citations: [],
      sources: [],
      evidence: [],
      response_time_ms: 12,
    });

    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.evidence.map((item) => item.sourceDomain)).toEqual([
      'open.spotify.com',
      'discogs.com',
    ]);
  });

  it('uses merged search_results when research has no useful sources', () => {
    const result = mapper.map(songRequest, {
      report: 'No relevant structured sources.',
      sources: [],
      citations: [],
      evidence: [],
      search_results: {
        results: [
          {
            title: 'الأماكن - محمد عبده',
            url: 'https://www.youtube.com/watch?v=example',
            fetched: true,
            relevance_score: 0.9,
          },
          {
            title: 'Al Amaken - Mohammed Abdo',
            url: 'https://open.spotify.com/track/example',
            fetched: true,
            relevance_score: 0.9,
          },
        ],
      },
    });

    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.evidence).toHaveLength(2);
  });

  it('maps multiple nested evidence arrays and normalizes source domains safely', () => {
    const result = mapper.map(animeRequest, {
      sources: [
        {
          title: 'Deidara (Naruto)',
          url: 'https://en.wikipedia.org/wiki/Deidara',
          fetched: true,
        },
      ],
      search_results: {
        evidence: [
          {
            title: 'Deidara - Character',
            url: 'https://anidb.net/character/8597',
            fetched: true,
          },
        ],
      },
    });

    expect(result.canonicalEntity).toBe('Deidara');
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.evidence.map((item) => item.sourceDomain)).toContain(
      'anidb.net',
    );
  });

  it('rejects empty research responses', () => {
    const result = mapper.map(songRequest, {
      sources: [],
      citations: [],
      evidence: [],
    });

    expect(result.verificationStatus).toBe('REJECTED');
    expect(result.issues).toContain(
      'ENTITY_VERIFICATION_INSUFFICIENT_EVIDENCE',
    );
  });

  it('does not mistake tool error text for evidence', () => {
    expect(() =>
      mapper.map(songRequest, {
        error: 'search_failed',
        error_reason: 'all engines failed',
      }),
    ).toThrow('WIGOLO_RESPONSE_INVALID');
  });

  it('does not mark unknown-domain search results as verified', () => {
    const result = mapper.map(songRequest, {
      results: [
        {
          title: 'الأماكن محمد عبده',
          url: 'https://example.invalid/song',
          fetched: true,
        },
      ],
    });

    expect(result.verificationStatus).toBe('PARTIALLY_VERIFIED');
  });

  it('rejects malformed evidence', () => {
    expect(() =>
      mapper.map(songRequest, {
        sources: [{ title: 'missing url' }],
        citations: [],
        evidence: [],
      }),
    ).toThrow('WIGOLO_RESPONSE_INVALID');
  });
});
