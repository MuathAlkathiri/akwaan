import { ResearchRouterService } from './research-router.service';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { categoryProfileRegistry } from './category-generation-profile.registry';

describe('ResearchRouterService', () => {
  it('keeps successful providers when another provider fails', async () => {
    const router = new ResearchRouterService([
      {
        id: 'bad',
        supports: () => true,
        research: async () => {
          throw new Error('offline');
        },
      },
      {
        id: 'good',
        supports: () => true,
        research: async () => ({ provider: 'good', facts: [] }),
      },
    ]);
    const results = await router.research({} as never);
    expect(results).toEqual([{ provider: 'good', facts: [] }]);
  });

  it('returns a typed aggregate failure when every provider fails', async () => {
    const router = new ResearchRouterService([
      {
        id: 'wikipedia',
        supports: () => true,
        research: async () => {
          throw new Error('PROVIDER_TIMEOUT');
        },
      },
      {
        id: 'wikidata',
        supports: () => true,
        research: async () => {
          throw new Error('PROVIDER_RATE_LIMITED');
        },
      },
    ]);
    await expect(router.research({} as never)).rejects.toThrow(
      'RESEARCH_ALL_PROVIDERS_FAILED:PROVIDER_TIMEOUT,PROVIDER_RATE_LIMITED',
    );
  });

  it.each([
    ['video-games', 'character', ['local', 'wikidata']],
    ['game-of-thrones', 'episode', ['local', 'wikipedia']],
    ['general-text-trivia', 'person', ['local', 'wikipedia', 'wikidata']],
  ])(
    'uses pack source policy for %s/%s',
    async (profileId, topicIntent, expected) => {
      const make = (
        id: string,
        kind: 'local' | 'structured' | 'narrative',
      ) => ({
        id,
        supports: (request: {
          pack: { sourcePreferenceByIntent: Record<string, string> };
          topicIntent: string;
        }) =>
          kind === 'local' ||
          request.pack.sourcePreferenceByIntent[request.topicIntent] ===
            'both' ||
          (kind === 'structured' &&
            request.pack.sourcePreferenceByIntent[request.topicIntent] ===
              'structured') ||
          (kind === 'narrative' &&
            request.pack.sourcePreferenceByIntent[request.topicIntent] ===
              'narrative'),
        research: async () => ({ provider: id, facts: [] }),
      });
      const router = new ResearchRouterService([
        make('local', 'local'),
        make('wikipedia', 'narrative'),
        make('wikidata', 'structured'),
      ] as never);
      const pack = new KnowledgePackRegistry().fromProfile(
        categoryProfileRegistry.byId(profileId),
      );
      const results = await router.research({ pack, topicIntent } as never);
      expect(results.map((result) => result.provider)).toEqual(expected);
    },
  );
});
