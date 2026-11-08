import {
  assertHistoricalJobAliasesUnambiguous,
  resolveHistoricalTarget,
} from './authoring-target-resolver';

const query = (rows: unknown[]) => ({
  limit() {
    return this;
  },
  lean: () => ({ exec: async () => rows }),
});

describe('historical target resolution', () => {
  const world = { _id: 'football-id', slug: 'test' };
  const scope = {
    _id: 'premier-id',
    worldId: 'football-id',
    slug: 'scope-1785790447091',
  };

  it('resolves production-shaped aliases and constrains the Scope to the World', async () => {
    const worlds = { find: jest.fn().mockReturnValue(query([world])) };
    const scopes = { find: jest.fn().mockReturnValue(query([scope])) };
    const result = await resolveHistoricalTarget(
      worlds as never,
      scopes as never,
      'football',
      'premier-league',
    );
    expect(result?.scope._id).toBe('premier-id');
    expect(result?.worldKeys).toContain('test');
    expect(result?.scopeKeys).toContain('scope-1785790447091');
    expect(scopes.find).toHaveBeenCalledWith(
      expect.objectContaining({ worldId: 'football-id' }),
    );
  });

  it('fails closed when a direct slug and another alias both match', async () => {
    const worlds = {
      find: jest
        .fn()
        .mockReturnValue(query([world, { _id: 'other', slug: 'football' }])),
    };
    const scopes = { find: jest.fn() };
    expect(
      await resolveHistoricalTarget(
        worlds as never,
        scopes as never,
        'football',
        'premier-league',
      ),
    ).toBeNull();
    expect(scopes.find).not.toHaveBeenCalled();
  });

  it('includes unlisted catalog slugs resolved through names', async () => {
    const worlds = {
      find: jest
        .fn()
        .mockReturnValue(
          query([{ _id: 'w', slug: 'old-football', name: 'عالم كرة القدم' }]),
        ),
    };
    const scopes = {
      find: jest
        .fn()
        .mockReturnValue(
          query([{ _id: 's', slug: 'old-league', name: 'الدوري الانجليزي' }]),
        ),
    };
    const result = await resolveHistoricalTarget(
      worlds as never,
      scopes as never,
      'football',
      'premier-league',
    );
    expect(result?.worldKeys).toContain('old-football');
    expect(result?.scopeKeys).toContain('old-league');
  });

  it('fails closed on missing or ambiguous Scopes', async () => {
    const worlds = { find: jest.fn().mockReturnValue(query([world])) };
    const scopes = {
      find: jest
        .fn()
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([scope, { ...scope, _id: 'other' }])),
    };
    expect(
      await resolveHistoricalTarget(
        worlds as never,
        scopes as never,
        'football',
        'premier-league',
      ),
    ).toBeNull();
    expect(
      await resolveHistoricalTarget(
        worlds as never,
        scopes as never,
        'football',
        'premier-league',
      ),
    ).toBeNull();
  });

  it('rejects a historical job whose alias is shared by multiple Scopes', () => {
    expect(() =>
      assertHistoricalJobAliasesUnambiguous([
        { worldKey: 'video-games', scopeKey: 'scope-1785881026837' },
      ]),
    ).toThrow('ambiguous');
    expect(() =>
      assertHistoricalJobAliasesUnambiguous([
        { worldKey: 'football', scopeKey: 'scope-1785790447091' },
      ]),
    ).not.toThrow();
  });
});
