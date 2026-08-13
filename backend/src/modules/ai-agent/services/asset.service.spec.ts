import {
  AssetMetadata,
  AssetProvider,
  AssetRequest,
} from '../contracts/asset-provider.interface';
import { AssetService } from '../application/asset.service';
import { WikimediaImageProvider } from '../infrastructure/assets/wikimedia-image.provider';
import { YouTubeAssetProvider } from '../infrastructure/assets/youtube-asset.provider';
import { normalizeAssetRequestIntent } from '../application/asset-request-normalizer';
import { JikanAnimeImageProvider } from '../infrastructure/assets/jikan-anime-image.provider';

class StubProvider implements AssetProvider {
  lastRequest?: AssetRequest;
  constructor(
    private readonly type: 'audio' | 'image' | 'video',
    private readonly providerName: string,
  ) {}

  supports(request: AssetRequest): boolean {
    return (
      request.type === this.type &&
      (!request.provider || request.provider === this.providerName)
    );
  }

  async process(request: AssetRequest): Promise<AssetMetadata> {
    this.lastRequest = request;
    return {
      type: request.type,
      localPath: 'question-assets/test',
      url: '/uploads/question-assets/test',
      source: this.providerName,
      provider: this.providerName,
    };
  }
}

class AnimeStubProvider extends StubProvider {
  constructor() {
    super('image', 'jikan');
  }
  supports(request: AssetRequest): boolean {
    return (
      super.supports(request) &&
      (request.categoryType === 'anime' ||
        request.entityType === 'anime-character') &&
      request.purpose !== 'decorative'
    );
  }
}

describe('AssetService provider selection', () => {
  const createService = () =>
    new AssetService(
      new StubProvider('audio', 'youtube') as unknown as YouTubeAssetProvider,
      new AnimeStubProvider() as unknown as JikanAnimeImageProvider,
      new StubProvider(
        'image',
        'wikimedia',
      ) as unknown as WikimediaImageProvider,
    );

  it('selects Wikimedia for an image request without an explicit provider', async () => {
    const result = await createService().process({
      type: 'image',
      entity: 'Naruto',
    });
    expect(result.assetStatus).toBe('READY');
    if (result.assetStatus === 'READY')
      expect(result.asset.provider).toBe('wikimedia');
  });

  it('uses Jikan before Wikimedia for an anime character', async () => {
    const result = await createService().process({
      type: 'image',
      entity: 'Hinata Hyuga',
      franchise: 'Naruto',
      entityType: 'anime-character',
      categoryType: 'anime',
      purpose: 'gameplay',
    });
    expect(result).toMatchObject({
      assetStatus: 'READY',
      asset: { provider: 'jikan' },
    });
  });

  it('falls back to Wikimedia when Jikan fails', async () => {
    const jikan = {
      supports: () => true,
      process: jest.fn().mockRejectedValue(new Error('JIKAN_NO_RESULTS')),
    } as unknown as JikanAnimeImageProvider;
    const service = new AssetService(
      new StubProvider('audio', 'youtube') as unknown as YouTubeAssetProvider,
      jikan,
      new StubProvider(
        'image',
        'wikimedia',
      ) as unknown as WikimediaImageProvider,
    );
    const result = await service.process({
      type: 'image',
      entity: 'Sai',
      franchise: 'Naruto',
      entityType: 'anime-character',
      categoryType: 'anime',
      purpose: 'gameplay',
    });
    expect(result).toMatchObject({
      assetStatus: 'READY',
      asset: {
        provider: 'wikimedia',
        metadata: {
          fallbackUsed: true,
          fallbackProviders: [
            expect.objectContaining({ reason: 'JIKAN_NO_RESULTS' }),
          ],
        },
      },
    });
  });

  it('normalizes runtime type and provider values before selection', async () => {
    const result = await createService().process({
      type: ' Image ' as AssetRequest['type'],
      provider: ' Wikimedia ',
    });
    expect(result.assetStatus).toBe('READY');
    if (result.assetStatus === 'READY')
      expect(result.asset.provider).toBe('wikimedia');
  });

  it('keeps YouTube as the default audio provider', async () => {
    const result = await createService().process({
      type: 'audio',
      entity: 'Kankuro',
    });
    expect(result.assetStatus).toBe('READY');
    if (result.assetStatus === 'READY')
      expect(result.asset.provider).toBe('youtube');
  });

  it('keeps YouTube as the default video provider', async () => {
    const service = new AssetService(
      new StubProvider('video', 'youtube') as unknown as YouTubeAssetProvider,
      new StubProvider('image', 'jikan') as unknown as JikanAnimeImageProvider,
      new StubProvider(
        'image',
        'wikimedia',
      ) as unknown as WikimediaImageProvider,
    );
    const result = await service.process({
      type: 'video',
      entity: 'Arya Stark',
      franchise: 'Game of Thrones',
    });
    expect(result.assetStatus).toBe('READY');
    if (result.assetStatus === 'READY')
      expect(result.asset.provider).toBe('youtube');
  });

  it.each([
    ['identifyVoice', 'voice'],
    ['identifySong', 'music'],
  ] as const)(
    'routes %s audio to YouTube with %s intent',
    async (gameMode, mediaIntent) => {
      const youtube = new StubProvider('audio', 'youtube');
      const service = new AssetService(
        youtube as unknown as YouTubeAssetProvider,
        new StubProvider(
          'image',
          'jikan',
        ) as unknown as JikanAnimeImageProvider,
        new StubProvider(
          'image',
          'wikimedia',
        ) as unknown as WikimediaImageProvider,
      );
      const result = await service.process(
        normalizeAssetRequestIntent(
          { type: 'audio', entity: 'Fixture audio' },
          gameMode,
        ),
      );
      expect(result.assetStatus).toBe('READY');
      if (result.assetStatus === 'READY')
        expect(result.asset.provider).toBe('youtube');
      expect(youtube.lastRequest?.mediaIntent).toBe(mediaIntent);
    },
  );

  it('includes provider rejection reasons in safe diagnostics', async () => {
    const rejectingYoutube = {
      supports: () => false,
      support: () => ({
        supported: false,
        reason: 'Unsupported mediaIntent: missing',
      }),
    } as unknown as YouTubeAssetProvider;
    const service = new AssetService(
      rejectingYoutube,
      new StubProvider('image', 'jikan') as unknown as JikanAnimeImageProvider,
      new StubProvider(
        'image',
        'wikimedia',
      ) as unknown as WikimediaImageProvider,
    );
    const result = await service.process({
      type: 'audio',
      entity: 'Kakashi',
    });
    expect(result).toMatchObject({
      assetStatus: 'FAILED',
      assetFailureDiagnostics: expect.arrayContaining([
        expect.objectContaining({
          supports: false,
          reason: 'Unsupported mediaIntent: missing',
        }),
      ]),
    });
  });
});
