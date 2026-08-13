import { categoryProfileRegistry } from '../../application/category-generation-profile.registry';
import { EntityResolutionService } from '../../application/entity-resolution.service';
import { KnowledgePackRegistry } from '../../application/knowledge-pack.registry';
import type { AiPipelineConfigService } from '../../application/ai-pipeline-config.service';
import type { ResearchRequest } from '../../domain/knowledge-unit.types';
import type { AuthoritativeHttpClient } from './authoritative-http.client';
import { MediaWikiResearchProvider } from './mediawiki-research.provider';

const config = {
  wikipedia: () => ({
    enabled: true,
    timeoutMs: 1000,
    maxResults: 5,
    maxExtractChars: 120,
    languages: ['ar', 'en'],
  }),
} as AiPipelineConfigService;
const request = (): ResearchRequest => ({
  cacheKey: 'k',
  pack: new KnowledgePackRegistry().fromProfile(
    categoryProfileRegistry.byId('general-text-trivia'),
  ),
  topicIntent: 'event',
  categoryName: 'Portal',
  entityHint: 'Portal',
  query: 'Portal event',
  locale: 'ar',
});

describe('MediaWikiResearchProvider', () => {
  it('resolves a clear page and returns bounded plain-text evidence', async () => {
    const getJson = jest.fn(async (url: URL) =>
      url.searchParams.get('list') === 'search'
        ? { query: { search: [{ pageid: 1, title: 'Portal' }] } }
        : {
            query: {
              pages: {
                1: {
                  pageid: 1,
                  title: 'Portal',
                  fullurl: 'https://ar.wikipedia.org/wiki/Portal',
                  extract:
                    'Portal is a puzzle-platform video game developed by Valve Corporation.',
                  pageprops: { wikibase_item: 'Q123' },
                },
              },
            },
          },
    );
    const provider = new MediaWikiResearchProvider(
      { getJson } as unknown as AuthoritativeHttpClient,
      config,
      new EntityResolutionService(),
    );
    const result = await provider.research(request());
    expect(result.facts[0]).toMatchObject({
      canonicalAnswer: 'Portal',
      evidence: {
        sourceType: 'encyclopedia',
        independenceGroup: 'wikimedia:Q123',
      },
    });
    expect(getJson.mock.calls[1][0].searchParams.get('exchars')).toBe('120');
  });

  it('falls back from Arabic to English', async () => {
    const getJson = jest.fn(async (url: URL) => {
      if (url.hostname === 'ar.wikipedia.org') return { query: { search: [] } };
      if (url.searchParams.get('list') === 'search')
        return { query: { search: [{ pageid: 2, title: 'Portal' }] } };
      return {
        query: {
          pages: {
            2: {
              pageid: 2,
              title: 'Portal',
              extract:
                'Portal is a puzzle-platform video game developed and published by Valve.',
            },
          },
        },
      };
    });
    const provider = new MediaWikiResearchProvider(
      { getJson } as unknown as AuthoritativeHttpClient,
      config,
      new EntityResolutionService(),
    );
    const result = await provider.research(request());
    expect(result.diagnostics).toMatchObject({
      language: 'en',
      fallbackLanguageUsed: true,
    });
  });

  it('rejects disambiguation pages and weak title matches', async () => {
    const disambiguationHttp = {
      getJson: jest.fn(async (url: URL) =>
        url.searchParams.get('list') === 'search'
          ? { query: { search: [{ pageid: 3, title: 'Portal' }] } }
          : {
              query: {
                pages: {
                  3: {
                    pageid: 3,
                    title: 'Portal',
                    extract:
                      'Portal may refer to several unrelated subjects and works.',
                    pageprops: { disambiguation: '' },
                  },
                },
              },
            },
      ),
    };
    const provider = new MediaWikiResearchProvider(
      disambiguationHttp as unknown as AuthoritativeHttpClient,
      {
        wikipedia: () => ({ ...config.wikipedia(), languages: ['ar'] }),
      } as AiPipelineConfigService,
      new EntityResolutionService(),
    );
    await expect(provider.research(request())).rejects.toThrow(
      'ENTITY_NOT_FOUND',
    );

    const weakHttp = {
      getJson: jest.fn(async () => ({
        query: { search: [{ pageid: 4, title: 'Unrelated subject' }] },
      })),
    };
    const weak = new MediaWikiResearchProvider(
      weakHttp as unknown as AuthoritativeHttpClient,
      {
        wikipedia: () => ({ ...config.wikipedia(), languages: ['ar'] }),
      } as AiPipelineConfigService,
      new EntityResolutionService(),
    );
    await expect(weak.research(request())).rejects.toThrow('ENTITY_MATCH_WEAK');
  });
});
