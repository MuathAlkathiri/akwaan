import { MediaDiscoveryError } from '../domain/media-discovery';
import {
  DEFAULT_DISCOVERY_USER_AGENT,
  WikimediaCommonsDiscoveryProvider,
} from './wikimedia-commons.discovery';

const page = (overrides: Record<string, unknown> = {}, info = {}) => ({
  pageid: 1,
  ns: 6,
  title: 'File:Arsène Wenger 2015.jpg',
  index: 1,
  imageinfo: [
    {
      size: 3_400_000,
      width: 4000,
      height: 3000,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Wenger_2015.jpg',
      descriptionurl:
        'https://commons.wikimedia.org/wiki/File:Ars%C3%A8ne_Wenger_2015.jpg',
      thumburl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wenger_2015.jpg/1280px-Wenger_2015.jpg',
      thumbwidth: 1280,
      thumbheight: 960,
      mime: 'image/jpeg',
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        AttributionRequired: { value: 'true' },
        Artist: {
          value:
            '<a href="//commons.wikimedia.org/wiki/User:Example" title="User:Example">Jane &amp; Co</a>',
        },
        Credit: {
          value: '<span class="int-own-work" lang="en">Own work</span>',
        },
      },
      ...info,
    },
  ],
  ...overrides,
});

const respond = (body: unknown, status = 200) =>
  jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch & jest.Mock;

describe('WikimediaCommonsDiscoveryProvider', () => {
  it('asks the File namespace for image info, licence metadata and a sized rendition', async () => {
    const fetchImpl = respond({ query: { pages: [page()] } });
    await new WikimediaCommonsDiscoveryProvider({ fetchImpl }).search(
      'Arsène Wenger',
      { limit: 8 },
    );

    const [url, init] = fetchImpl.mock.calls[0];
    const asked = new URL(url as string);
    expect(asked.origin + asked.pathname).toBe(
      'https://commons.wikimedia.org/w/api.php',
    );
    expect(Object.fromEntries(asked.searchParams)).toEqual({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrsearch: 'Arsène Wenger',
      gsrnamespace: '6',
      gsrlimit: '8',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1280',
    });
    // Wikimedia blocks clients that do not identify themselves.
    expect(init.headers['user-agent']).toBe(DEFAULT_DISCOVERY_USER_AGENT);
  });

  it('maps a hit to the rendition to download, the original, and plain-text provenance', async () => {
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({ query: { pages: [page()] } }),
    });
    expect(await provider.search('Arsène Wenger', { limit: 5 })).toEqual([
      {
        provider: 'wikimedia-commons',
        rank: 0,
        matchedPhrase: 'Arsène Wenger',
        title: 'Arsène Wenger 2015.jpg',
        downloadUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wenger_2015.jpg/1280px-Wenger_2015.jpg',
        width: 1280,
        height: 960,
        originalUrl:
          'https://upload.wikimedia.org/wikipedia/commons/a/ab/Wenger_2015.jpg',
        pageUrl:
          'https://commons.wikimedia.org/wiki/File:Ars%C3%A8ne_Wenger_2015.jpg',
        originalMimetype: 'image/jpeg',
        licence: {
          name: 'CC BY-SA 4.0',
          url: 'https://creativecommons.org/licenses/by-sa/4.0',
          attributionRequired: true,
        },
        author: 'Jane & Co',
        credit: 'Own work',
      },
    ]);
  });

  it('orders by search relevance, not by the page order the API returns', async () => {
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({
        query: {
          pages: [
            page({ title: 'File:Third.jpg', index: 3 }),
            page({ title: 'File:First.jpg', index: 1 }),
            page({ title: 'File:Second.jpg', index: 2 }),
          ],
        },
      }),
    });
    const found = await provider.search('x', { limit: 5 });
    expect(found.map((media) => [media.rank, media.title])).toEqual([
      [0, 'First.jpg'],
      [1, 'Second.jpg'],
      [2, 'Third.jpg'],
    ]);
  });

  it('does not believe a rendition size larger than the original', async () => {
    // What the live API does for a small photo: the "rendition" is reported at
    // the width asked for, but the bytes behind it are the 404x575 original.
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({
        query: {
          pages: [
            page(
              {},
              {
                width: 404,
                height: 575,
                thumbwidth: 1280,
                thumbheight: 1822,
              },
            ),
          ],
        },
      }),
    });
    const [media] = await provider.search('x', { limit: 5 });
    expect([media.width, media.height]).toEqual([404, 575]);
    expect(media.downloadUrl).toBe(media.originalUrl);
  });

  it('falls back to the original when no rendition is offered', async () => {
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({
        query: {
          pages: [
            page(
              {},
              {
                thumburl: undefined,
                thumbwidth: undefined,
                thumbheight: undefined,
                width: 1200,
                height: 900,
              },
            ),
          ],
        },
      }),
    });
    const [media] = await provider.search('x', { limit: 5 });
    expect(media.downloadUrl).toBe(media.originalUrl);
    expect([media.width, media.height]).toEqual([1200, 900]);
  });

  it('keeps an SVG only through its raster rendition, and drops what cannot become a raster', async () => {
    const svg = { mime: 'image/svg+xml' };
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({
        query: {
          pages: [
            page({ title: 'File:Crest.svg', index: 1 }, svg),
            page(
              { title: 'File:Crest without rendition.svg', index: 2 },
              { ...svg, thumburl: undefined },
            ),
            page({ title: 'File:Scan.tif', index: 3 }, { mime: 'image/tiff' }),
            page({ title: 'File:Anthem.ogg', index: 4 }, { mime: 'audio/ogg' }),
            page({ title: 'File:No info.jpg', index: 5, imageinfo: [] }),
          ],
        },
      }),
    });
    const found = await provider.search('x', { limit: 10 });
    expect(found.map((media) => media.title)).toEqual(['Crest.svg']);
    expect(found[0].downloadUrl).toContain('/thumb/');
  });

  it('reports missing licence metadata as unknown rather than guessing', async () => {
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({
        query: { pages: [page({}, { extmetadata: undefined })] },
      }),
    });
    const [media] = await provider.search('x', { limit: 5 });
    expect(media.licence).toEqual({
      name: null,
      url: null,
      attributionRequired: null,
    });
    expect(media.author).toBeNull();
  });

  it('treats an answer with no hits as an empty result', async () => {
    const provider = new WikimediaCommonsDiscoveryProvider({
      fetchImpl: respond({ batchcomplete: true }),
    });
    expect(await provider.search('zzzz', { limit: 5 })).toEqual([]);
  });

  it.each([
    ['an HTTP error', respond({}, 503), 'DISCOVERY_HTTP_STATUS'],
    [
      'a MediaWiki error sent with HTTP 200',
      respond({ error: { code: 'badvalue', info: 'x' } }),
      'DISCOVERY_BAD_RESPONSE',
    ],
    [
      'the old object-keyed pages shape',
      respond({ query: { pages: { '1': page() } } }),
      'DISCOVERY_BAD_RESPONSE',
    ],
  ])('fails with a stable code on %s', async (_name, fetchImpl, code) => {
    const search = new WikimediaCommonsDiscoveryProvider({ fetchImpl }).search(
      'x',
      { limit: 5 },
    );
    await expect(search).rejects.toBeInstanceOf(MediaDiscoveryError);
    await expect(search).rejects.toMatchObject({ code });
  });

  it('times out instead of hanging, and says so', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(
      new WikimediaCommonsDiscoveryProvider({
        fetchImpl,
        timeoutMs: 20,
      }).search('x', { limit: 5 }),
    ).rejects.toMatchObject({ code: 'DISCOVERY_TIMEOUT' });
  });

  it('turns a network failure into DISCOVERY_FAILED', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    await expect(
      new WikimediaCommonsDiscoveryProvider({ fetchImpl }).search('x', {
        limit: 5,
      }),
    ).rejects.toMatchObject({ code: 'DISCOVERY_FAILED' });
  });
});
