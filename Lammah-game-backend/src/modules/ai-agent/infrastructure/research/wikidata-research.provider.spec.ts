import { categoryProfileRegistry } from '../../application/category-generation-profile.registry';
import { EntityResolutionService } from '../../application/entity-resolution.service';
import { KnowledgePackRegistry } from '../../application/knowledge-pack.registry';
import type { AiPipelineConfigService } from '../../application/ai-pipeline-config.service';
import type { ResearchRequest } from '../../domain/knowledge-unit.types';
import type { AuthoritativeHttpClient } from './authoritative-http.client';
import { WikidataResearchProvider } from './wikidata-research.provider';

const config = {
  wikidata: () => ({
    enabled: true,
    timeoutMs: 1000,
    maxEntities: 5,
    maxFactsPerEntity: 30,
  }),
} as AiPipelineConfigService;
const request: ResearchRequest = {
  cacheKey: 'k',
  pack: new KnowledgePackRegistry().fromProfile(
    categoryProfileRegistry.byId('video-games'),
  ),
  topicIntent: 'character',
  categoryName: 'Portal',
  entityHint: 'Portal',
  query: 'Portal',
};

describe('WikidataResearchProvider', () => {
  it('resolves an entity and extracts only allowlisted properties', async () => {
    const getJson = jest.fn(async (url: URL) =>
      url.searchParams.get('action') === 'wbsearchentities'
        ? { search: [{ id: 'Q1', label: 'Portal' }] }
        : {
            entities: {
              Q1: {
                id: 'Q1',
                labels: { en: { value: 'Portal' } },
                claims: {
                  P577: [
                    {
                      mainsnak: {
                        datavalue: { value: { time: '+2007-10-10T00:00:00Z' } },
                      },
                    },
                  ],
                  P999: [
                    { mainsnak: { datavalue: { value: 'must be ignored' } } },
                  ],
                },
              },
            },
          },
    );
    const provider = new WikidataResearchProvider(
      { getJson } as unknown as AuthoritativeHttpClient,
      config,
      new EntityResolutionService(),
    );
    const result = await provider.research(request);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      canonicalAnswer: '2007-10-10',
      evidence: { propertyId: 'P577', sourceType: 'structured-data' },
    });
    expect(result.diagnostics?.rejectedFacts).toBe(1);
    expect(
      getJson.mock.calls.every(([url]) => url.hostname === 'www.wikidata.org'),
    ).toBe(true);
  });
});
