import { KnowledgeNormalizerService } from './knowledge-normalizer.service';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { categoryProfileRegistry } from './category-generation-profile.registry';

describe('KnowledgeNormalizerService', () => {
  it('merges the same normalized fact from Wikipedia and Wikidata', () => {
    const normalizer = new KnowledgeNormalizerService({
      cacheTtlSeconds: () => 3600,
    } as never);
    const pack = new KnowledgePackRegistry().fromProfile(
      categoryProfileRegistry.byId('general-text-trivia'),
    );
    const base = {
      fact: 'Portal — release date: 2007-10-10',
      canonicalAnswer: '2007-10-10',
      confidence: 0.9,
    };
    const units = normalizer.normalize(
      {
        cacheKey: 'provider-independent',
        pack,
        topicIntent: 'event',
        categoryName: 'Portal',
        query: 'Portal release',
      },
      [
        {
          provider: 'wikipedia',
          facts: [
            {
              ...base,
              evidence: {
                sourceId: 'wp',
                provider: 'wikipedia',
                title: 'Portal',
                url: 'https://en.wikipedia.org/wiki/Portal_(video_game)',
                excerpt: base.fact,
                retrievedAt: new Date().toISOString(),
                trustScore: 0.8,
                independenceGroup: 'wikimedia:Q1',
              },
            },
          ],
        },
        {
          provider: 'wikidata',
          facts: [
            {
              ...base,
              evidence: {
                sourceId: 'wd',
                provider: 'wikidata',
                title: 'Portal',
                url: 'https://www.wikidata.org/wiki/Q1',
                excerpt: base.fact,
                retrievedAt: new Date().toISOString(),
                trustScore: 0.9,
                independenceGroup: 'wikimedia:Q1',
              },
            },
          ],
        },
      ],
    );
    expect(units).toHaveLength(1);
    expect(units[0].evidence.map((item) => item.provider)).toEqual([
      'wikipedia',
      'wikidata',
    ]);
  });
});
