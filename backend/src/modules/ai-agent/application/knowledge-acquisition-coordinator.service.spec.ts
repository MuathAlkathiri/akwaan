import { KnowledgeAcquisitionCoordinatorService } from './knowledge-acquisition-coordinator.service';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { categoryProfileRegistry } from './category-generation-profile.registry';

describe('KnowledgeAcquisitionCoordinatorService', () => {
  it('deduplicates simultaneous misses and persists normalized evidence once', async () => {
    const repository = {
      findFresh: jest.fn(async () => []),
      putMany: jest.fn(async () => undefined),
    };
    const router = {
      research: jest.fn(async () => [
        {
          provider: 'local',
          facts: [
            {
              fact: 'Portal uses a portal device',
              canonicalAnswer: 'Portal Device',
              confidence: 0.9,
              evidence: {
                sourceId: 's1',
                provider: 'local',
                title: 'facts',
                url: 'knowledge://facts',
                excerpt: 'Portal uses a portal device',
                retrievedAt: new Date().toISOString(),
                trustScore: 0.9,
              },
            },
          ],
        },
      ]),
    };
    const config = { cacheTtlSeconds: () => 3600 };
    const coordinator = new KnowledgeAcquisitionCoordinatorService(
      router as never,
      repository as never,
      config as never,
    );
    const pack = new KnowledgePackRegistry().fromProfile(
      categoryProfileRegistry.byId('video-games'),
    );
    const request = {
      cacheKey: 'same',
      pack,
      topicIntent: 'item',
      categoryName: 'games',
      query: 'portal item',
    };
    const [first, second] = await Promise.all([
      coordinator.acquire(request),
      coordinator.acquire(request),
    ]);
    expect(router.research).toHaveBeenCalledTimes(1);
    expect(repository.putMany).toHaveBeenCalledTimes(1);
    expect(first[0].factHash).toBe(second[0].factHash);
  });

  it('returns a fresh cache hit without invoking providers', async () => {
    const cached = [{ id: 'cached' }];
    const repository = {
      findFresh: jest.fn(async () => cached),
      putMany: jest.fn(),
    };
    const router = { research: jest.fn() };
    const coordinator = new KnowledgeAcquisitionCoordinatorService(
      router as never,
      repository as never,
      { cacheTtlSeconds: () => 1 } as never,
    );
    await expect(
      coordinator.acquire({ cacheKey: 'hit' } as never),
    ).resolves.toBe(cached);
    expect(router.research).not.toHaveBeenCalled();
  });

  it('blocks conflicting answers for the same claim', async () => {
    const repository = {
      findFresh: jest.fn(async () => []),
      putMany: jest.fn(),
    };
    const evidence = {
      sourceId: 's',
      provider: 'p',
      title: 't',
      url: 'https://example.test',
      excerpt: 'claim',
      retrievedAt: new Date().toISOString(),
      trustScore: 0.9,
    };
    const router = {
      research: jest.fn(async () => [
        {
          provider: 'one',
          facts: [
            {
              fact: 'same claim',
              canonicalAnswer: 'A',
              confidence: 0.9,
              evidence,
            },
          ],
        },
        {
          provider: 'two',
          facts: [
            {
              fact: 'same claim',
              canonicalAnswer: 'B',
              confidence: 0.9,
              evidence: { ...evidence, sourceId: 's2' },
            },
          ],
        },
      ]),
    };
    const coordinator = new KnowledgeAcquisitionCoordinatorService(
      router as never,
      repository as never,
      { cacheTtlSeconds: () => 1 } as never,
    );
    const pack = new KnowledgePackRegistry().fromProfile(
      categoryProfileRegistry.byId('video-games'),
    );
    await expect(
      coordinator.acquire({
        cacheKey: 'conflict',
        pack,
        topicIntent: 'item',
        categoryName: 'games',
        query: 'q',
      }),
    ).rejects.toThrow('RESEARCH_INSUFFICIENT_EVIDENCE');
    expect(repository.putMany).not.toHaveBeenCalled();
  });
});
