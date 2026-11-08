import { classifyHistoricalApprovals } from './historical-approved-inventory';

describe('candidate-first historical approval inventory', () => {
  const chain = (rows: unknown[]) => {
    const query: any = {};
    for (const method of ['session', 'select', 'sort', 'limit', 'lean'])
      query[method] = jest.fn().mockReturnValue(query);
    query.exec = jest.fn().mockResolvedValue(rows);
    return query;
  };
  it('starts with approved unpublished candidates and propagates the caller session', async () => {
    const query = chain([]);
    const candidates = { find: jest.fn().mockReturnValue(query) };
    const session = {} as any;
    const models = { candidates } as any;
    await expect(
      classifyHistoricalApprovals(models, 'scope', session),
    ).resolves.toEqual([]);
    expect(candidates.find).toHaveBeenCalledWith({
      reviewStatus: 'approved',
      publishedContentItemId: null,
    });
    expect(query.session).toHaveBeenCalledWith(session);
    expect(query.limit).toHaveBeenCalledWith(1001);
  });
  it('fails closed when approved candidates exceed the bound', async () => {
    const query = chain(Array.from({ length: 1001 }, () => ({})));
    await expect(
      classifyHistoricalApprovals(
        { candidates: { find: () => query } } as any,
        'scope',
      ),
    ).rejects.toThrow('exceeds safety limit');
  });
  it('fails closed for untrusted approval metadata', async () => {
    const query = chain([{ candidateId: 'a', reviewStatus: 'approved' }]);
    await expect(
      classifyHistoricalApprovals(
        { candidates: { find: () => query } } as any,
        'scope',
      ),
    ).rejects.toThrow('provenance is untrusted');
  });
});
