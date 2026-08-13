import { KnowledgeLoaderService } from './knowledge-loader.service';

describe('KnowledgeLoaderService', () => {
  it('does not substitute default.md for a missing football file', async () => {
    const loaded = await new KnowledgeLoaderService().load(
      'sports/definitely-missing-football.md',
    );
    expect(loaded).toMatchObject({
      knowledgeFile: 'sports/definitely-missing-football.md',
      usedDefaultKnowledge: false,
      localKnowledgeFound: false,
      issueCode: 'CATEGORY_LOCAL_KNOWLEDGE_NOT_FOUND',
      knowledge: { raw: '' },
    });
    expect(loaded.knowledge.raw).not.toContain('Akwaan');
  });
});
