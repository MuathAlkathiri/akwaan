import { MediaDiscoveryError } from '../domain/media-discovery';
import { BraveImageSearchDiscoveryProvider } from './brave-image-search.discovery';

const result = (over: Record<string, unknown> = {}) => ({
  title: 'Leicester City crest',
  url: 'https://site.example/page',
  source: 'site.example',
  thumbnail: { src: 'https://imgs.search.brave.com/thumb' },
  properties: {
    url: 'https://cdn.example/crest.png',
    width: 1200,
    height: 1200,
  },
  ...over,
});

const build = (body: unknown, status = 200) => {
  const fetchImpl = jest.fn<Promise<Response>, [string, RequestInit?]>(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as Response,
  );
  const provider = new BraveImageSearchDiscoveryProvider('secret-key', {
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { provider, fetchImpl };
};

describe('BraveImageSearchDiscoveryProvider', () => {
  it('is a fallback provider', () => {
    expect(build({}).provider.tier).toBe('fallback');
  });

  it('sends the key as a header, never in the address, with safe search on', async () => {
    const { provider, fetchImpl } = build({ results: [] });
    await provider.search('Stamford Bridge (stadium)', { limit: 6 });
    const [address, init] = fetchImpl.mock.calls[0];
    const url = new URL(address);
    expect(url.searchParams.get('q')).toBe('Stamford Bridge stadium');
    expect(url.searchParams.get('safesearch')).toBe('strict');
    expect(address).not.toContain('secret-key');
    expect(
      (init!.headers as Record<string, string>)['x-subscription-token'],
    ).toBe('secret-key');
  });

  it('asks for the logo when the subject is a club or brand mark', async () => {
    const { provider, fetchImpl } = build({ results: [] });
    await provider.search('Leicester City F.C.', {
      limit: 6,
      kind: 'club-or-brand-mark',
    });
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('q')).toBe(
      'Leicester City F.C. logo',
    );
  });

  it('maps a result with no licence and no author, keeping the page it came from', async () => {
    const { provider } = build({ results: [result()] });
    const [media] = await provider.search('Leicester City F.C.', { limit: 6 });
    expect(media).toMatchObject({
      provider: 'brave-search',
      title: 'Leicester City crest',
      downloadUrl: 'https://cdn.example/crest.png',
      pageUrl: 'https://site.example/page',
      width: 1200,
      height: 1200,
      originalMimetype: 'image/png',
      previewUrl: 'https://imgs.search.brave.com/thumb',
      licence: { name: null, url: null, attributionRequired: null },
      author: null,
    });
    expect(media.subjectVerified).toBeUndefined();
  });

  it('drops results with no size, no image address, or a non-HTTPS one', async () => {
    const { provider } = build({
      results: [
        result({ properties: { url: 'https://cdn.example/a.jpg' } }),
        result({ properties: { width: 800, height: 800 } }),
        result({
          properties: {
            url: 'http://cdn.example/b.jpg',
            width: 800,
            height: 800,
          },
        }),
        result(),
      ],
    });
    const found = await provider.search('x', { limit: 6 });
    expect(found.map((media) => media.downloadUrl)).toEqual([
      'https://cdn.example/crest.png',
    ]);
  });

  it('reports a refused key as a provider failure', async () => {
    const { provider } = build({}, 401);
    await expect(provider.search('x', { limit: 6 })).rejects.toMatchObject({
      code: 'DISCOVERY_HTTP_STATUS',
      status: 401,
    } satisfies Partial<MediaDiscoveryError>);
  });
});
