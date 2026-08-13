import { ImageDownloadService } from '../infrastructure/assets/image-download.service';
import { WikimediaImageProvider } from '../infrastructure/assets/wikimedia-image.provider';
import { AssetProviderStepError } from '../infrastructure/assets/youtube-asset.provider';

describe('WikimediaImageProvider search candidates', () => {
  const provider = new WikimediaImageProvider({} as ImageDownloadService);

  it('builds concise character candidates in priority order', () => {
    expect(
      provider.buildCandidates({
        type: 'image',
        entity: 'Itachi Uchiha',
        franchise: 'Naruto',
        entityType: 'character',
        originalName: 'うちはイタチ',
        purpose: 'gameplay',
        query: 'من فضلك ابحث عن صورة تظهر هذه الشخصية في الأنمي',
      }),
    ).toEqual([
      'Itachi Uchiha',
      'Itachi Uchiha Naruto',
      'Itachi Uchiha portrait',
      'うちはイタチ',
    ]);
  });

  it('uses franchise-level candidates for decorative covers', () => {
    expect(
      provider.buildCandidates({
        type: 'image',
        entity: 'Itachi Uchiha',
        franchise: 'Naruto',
        entityType: 'character',
        purpose: 'decorative',
      }),
    ).toEqual(['Naruto', 'Naruto logo']);
  });

  it('rejects a legacy query that is not bound to an entity alias', () => {
    expect(
      provider.buildCandidates({
        type: 'image',
        entity: 'Konoha',
        franchise: 'Naruto',
        entityType: 'location',
        query: 'Hidden Leaf Village',
        purpose: 'gameplay',
      }),
    ).toEqual(['Konoha', 'Konoha Naruto', 'Konoha location']);
  });

  it('ranks a relevant result above the first loosely related page', () => {
    expect(
      provider.selectPage(
        [
          { title: 'Naruto episodes', thumbnail: { source: 'episodes.jpg' } },
          { title: 'Itachi Uchiha', original: { source: 'itachi.jpg' } },
          { title: 'Naruto', original: { source: 'naruto.jpg' } },
        ],
        'Itachi Uchiha Naruto',
      )?.title,
    ).toBe('Itachi Uchiha');
  });

  it('rejects disambiguation and list pages', () => {
    expect(
      provider.selectPage(
        [
          { title: 'Mercury (disambiguation)', original: { source: 'a.jpg' } },
          { title: 'Mercury (planet)', original: { source: 'b.jpg' } },
        ],
        'Mercury planet',
      )?.title,
    ).toBe('Mercury (planet)');
  });

  describe('page collection normalization', () => {
    const page = {
      pageid: 1,
      title: 'Eiffel Tower',
      original: { source: 'https://example.test/eiffel.jpg' },
    };

    it('supports array and page-id keyed object shapes', () => {
      expect(provider.normalizePages([page])).toEqual([page]);
      expect(provider.normalizePages({ '1': page })).toEqual([page]);
    });

    it.each([undefined, null, {}, []])(
      'normalizes missing or empty pages safely',
      (value) => {
        expect(provider.normalizePages(value)).toEqual([]);
      },
    );

    it('skips malformed entries while preserving valid pages', () => {
      expect(
        provider.normalizePages({
          bad: 'not-a-page',
          missingTitle: { pageid: 2 },
          valid: page,
        }),
      ).toEqual([page]);
    });
  });

  it('isolates an invalid query response and consumes a later object-shaped response', async () => {
    const downloader = {
      download: jest.fn().mockResolvedValue({
        localPath: 'question-assets/eiffel.jpg',
        url: '/uploads/question-assets/eiffel.jpg',
      }),
    } as unknown as ImageDownloadService;
    const runtimeProvider = new WikimediaImageProvider(downloader);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ query: { pages: 'invalid' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: {
              pages: {
                '123': {
                  pageid: 123,
                  title: 'Eiffel Tower',
                  fullurl: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
                  original: { source: 'https://example.test/eiffel.jpg' },
                },
                malformed: { pageid: 999 },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ query: { pages: [] } }), {
          status: 200,
        }),
      );

    const result = await runtimeProvider.process({
      type: 'image',
      entity: 'Eiffel Tower',
      franchise: 'Paris regression fixture',
      entityType: 'location',
      purpose: 'gameplay',
    });

    expect(result.metadata).toMatchObject({
      title: 'Eiffel Tower',
      attemptedQueries: [
        'Eiffel Tower',
        'Eiffel Tower Paris regression fixture',
        'Eiffel Tower location',
      ],
      successfulQuery: 'Eiffel Tower Paris regression fixture',
      candidateCount: 1,
      fallbackUsed: true,
    });
    expect(downloader.download).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });

  it.each([
    [
      { query: { pages: 'invalid' } },
      'WIKIMEDIA_RESPONSE_INVALID',
      'Wikimedia returned an invalid page collection',
    ],
    [
      { query: { pages: {} } },
      'WIKIMEDIA_NO_RESULTS',
      'Wikimedia returned no search results',
    ],
  ])(
    'classifies invalid responses separately from empty results',
    async (payload, failureCode, message) => {
      const runtimeProvider = new WikimediaImageProvider(
        {} as ImageDownloadService,
      );
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
        async () =>
          new Response(JSON.stringify(payload), {
            status: 200,
          }),
      );

      await expect(
        runtimeProvider.process({
          type: 'image',
          entity: `Regression ${failureCode}`,
          query: `Regression ${failureCode}`,
          purpose: 'gameplay',
        }),
      ).rejects.toMatchObject<Partial<AssetProviderStepError>>({
        message,
        diagnostics: expect.objectContaining({
          failureCode,
          attemptedQueryCount: 2,
          candidateCount: 0,
        }),
      });
      fetchMock.mockRestore();
    },
  );

  it('applies the per-query candidate limit after object normalization', async () => {
    const downloader = {
      download: jest.fn().mockResolvedValue({
        localPath: 'question-assets/tower.jpg',
        url: '/uploads/question-assets/tower.jpg',
      }),
    } as unknown as ImageDownloadService;
    const runtimeProvider = new WikimediaImageProvider(downloader);
    const pages = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        String(index + 1),
        {
          pageid: index + 1,
          title: `Regression Tower ${index + 1}`,
          original: { source: `https://example.test/tower-${index + 1}.jpg` },
        },
      ]),
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ query: { pages } }), { status: 200 }),
      );

    const result = await runtimeProvider.process({
      type: 'image',
      entity: 'Regression Tower',
      query: 'Regression Tower',
      purpose: 'gameplay',
    });

    expect(result.metadata).toMatchObject({
      rawCandidateCount: 6,
      candidateCount: 5,
      deduplicatedCandidateCount: 5,
      rejectedCandidateCount: 1,
    });
    fetchMock.mockRestore();
  });
});
