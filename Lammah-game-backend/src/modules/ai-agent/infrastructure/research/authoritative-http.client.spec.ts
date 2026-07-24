import { AuthoritativeHttpClient } from './authoritative-http.client';

describe('AuthoritativeHttpClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects arbitrary hosts before networking', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(
      new AuthoritativeHttpClient().getJson(
        new URL('https://evil.example/api'),
        { timeoutMs: 100, maxBytes: 1000 },
      ),
    ).rejects.toThrow('RESEARCH_URL_NOT_ALLOWED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bounds response size', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ data: 'x'.repeat(100) }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;
    await expect(
      new AuthoritativeHttpClient().getJson(
        new URL('https://www.wikidata.org/w/api.php'),
        { timeoutMs: 100, maxBytes: 20 },
      ),
    ).rejects.toThrow('PROVIDER_RESPONSE_TOO_LARGE');
  });
});
