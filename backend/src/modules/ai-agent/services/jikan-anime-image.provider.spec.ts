import { ConfigService } from '@nestjs/config';
import { ImageDownloadService } from '../infrastructure/assets/image-download.service';
import { JikanAnimeImageProvider } from '../infrastructure/assets/jikan-anime-image.provider';

describe('JikanAnimeImageProvider', () => {
  const config = (enabled = true) =>
    ({
      get: jest.fn(
        (key: string) =>
          ({
            JIKAN_PROVIDER_ENABLED: String(enabled),
            JIKAN_API_BASE_URL: 'https://jikan.test/v4',
            JIKAN_MIN_REQUEST_INTERVAL_MS: '1',
            JIKAN_REQUEST_TIMEOUT_MS: '1000',
          })[key],
      ),
    }) as unknown as ConfigService;
  const downloader = {
    download: jest.fn().mockResolvedValue({
      localPath: 'question-assets/images/hinata.jpg',
      url: '/uploads/question-assets/images/hinata.jpg',
    }),
  } as unknown as ImageDownloadService;
  const animeRequest = {
    type: 'image' as const,
    entity: 'Hinata Hyuga',
    originalName: '日向ヒナタ',
    franchise: 'Naruto',
    entityType: 'anime-character',
    categoryType: 'anime',
    gameMode: 'identifyCharacter' as const,
    purpose: 'gameplay' as const,
  };

  afterEach(() => jest.restoreAllMocks());

  it('supports primary anime characters but not unrelated or decorative requests', () => {
    const provider = new JikanAnimeImageProvider(config(), downloader);
    expect(provider.supports(animeRequest)).toBe(true);
    expect(
      provider.supports({
        type: 'image',
        entity: 'Paris',
        entityType: 'location',
      }),
    ).toBe(false);
    expect(
      provider.supports({
        type: 'image',
        entity: 'Albert Einstein',
        entityType: 'person',
      }),
    ).toBe(false);
    expect(provider.supports({ ...animeRequest, purpose: 'decorative' })).toBe(
      false,
    );
  });

  it('keeps semantic support separate from runtime enablement', async () => {
    const provider = new JikanAnimeImageProvider(config(false), downloader);
    expect(provider.supports(animeRequest)).toBe(true);
    await expect(provider.process(animeRequest)).rejects.toMatchObject({
      diagnostics: expect.objectContaining({
        failureCode: 'JIKAN_PROVIDER_DISABLED',
      }),
    });
  });

  it('normalizes valid entries and rejects invalid response collections', () => {
    const provider = new JikanAnimeImageProvider(config(), downloader);
    expect(
      provider.normalizeSearchResponse(
        {
          data: [
            {
              mal_id: 1,
              name: 'Hinata Hyuga',
              name_kanji: '日向ヒナタ',
              nicknames: ['Hinata'],
              images: { jpg: { image_url: 'https://img.test/h.jpg' } },
            },
          ],
          pagination: { last_visible_page: 1 },
        },
        'Hinata Hyuga',
      ),
    ).toMatchObject([
      {
        mal_id: 1,
        name: 'Hinata Hyuga',
        name_kanji: '日向ヒナタ',
        nicknames: ['Hinata'],
      },
    ]);
    expect(() =>
      provider.normalizeSearchResponse({ data: null }, 'Hinata'),
    ).toThrow('Jikan search response was invalid');
    expect(() => provider.normalizeSearchResponse({}, 'Hinata')).toThrow(
      'Jikan search response was invalid',
    );
  });

  it('rejects the first wrong-franchise candidate and selects the exact Naruto character', async () => {
    const provider = new JikanAnimeImageProvider(config(), downloader);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                mal_id: 10,
                name: 'Hinata Hyuga',
                nicknames: [],
                images: {
                  jpg: { large_image_url: 'https://img.test/wrong.jpg' },
                },
              },
              {
                mal_id: 11,
                name: 'Hinata Hyuga',
                name_kanji: '日向ヒナタ',
                nicknames: ['Hinata'],
                url: 'https://myanimelist.net/character/11',
                images: {
                  webp: { large_image_url: 'https://img.test/right.webp' },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              anime: [{ anime: { mal_id: 1, name: 'Unrelated Fantasy' } }],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              anime: [
                { anime: { mal_id: 20, name: 'Naruto' } },
                { anime: { mal_id: 21, name: 'Naruto: Shippuden' } },
              ],
            },
          }),
          { status: 200 },
        ),
      );
    const result = await provider.process(animeRequest);
    expect(result).toMatchObject({
      provider: 'jikan',
      source: 'jikan',
      sourceUrl: 'https://myanimelist.net/character/11',
      metadata: {
        providerEntityId: '11',
        sourceLabel: 'Jikan / MyAnimeList',
        usageType: 'third-party-reference',
        validCandidateCount: 1,
        rejectedCount: 1,
      },
    });
    expect(downloader.download).toHaveBeenCalledWith(
      'https://img.test/right.webp',
      'Hinata Hyuga',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
