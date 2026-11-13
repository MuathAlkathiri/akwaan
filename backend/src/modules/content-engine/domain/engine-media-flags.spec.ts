import { resolveEngineMediaFlags } from './engine-media-flags';

const config = (values: Record<string, string>) => ({
  get: <T = string>(key: string) => values[key] as T | undefined,
});

describe('resolveEngineMediaFlags', () => {
  it('defaults every media switch off', () => {
    expect(resolveEngineMediaFlags(config({}))).toEqual({
      enrichment: false,
      imageGeneration: false,
      wigoloDiscovery: false,
    });
    expect(resolveEngineMediaFlags(undefined)).toEqual({
      enrichment: false,
      imageGeneration: false,
      wigoloDiscovery: false,
    });
  });

  it('ignores child switches unless enrichment and the engine are both on', () => {
    expect(
      resolveEngineMediaFlags(
        config({
          ENGINE_IMAGE_GENERATION_ENABLED: 'true',
          ENGINE_MEDIA_DISCOVERY_WIGOLO_ENABLED: 'true',
          ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
        }),
      ),
    ).toEqual({
      enrichment: false,
      imageGeneration: false,
      wigoloDiscovery: false,
    });
    expect(
      resolveEngineMediaFlags(
        config({
          CONTENT_ENGINE_ENABLED: 'true',
          ENGINE_IMAGE_GENERATION_ENABLED: 'true',
        }),
      ).imageGeneration,
    ).toBe(false);
  });

  it('enables each switch independently once its parents are on', () => {
    expect(
      resolveEngineMediaFlags(
        config({
          CONTENT_ENGINE_ENABLED: 'on',
          ENGINE_MEDIA_ENRICHMENT_ENABLED: '1',
          ENGINE_MEDIA_DISCOVERY_WIGOLO_ENABLED: 'yes',
        }),
      ),
    ).toEqual({
      enrichment: true,
      imageGeneration: false,
      wigoloDiscovery: true,
    });
  });

  it('treats unrecognized values as off', () => {
    expect(
      resolveEngineMediaFlags(
        config({
          CONTENT_ENGINE_ENABLED: 'true',
          ENGINE_MEDIA_ENRICHMENT_ENABLED: 'enabled',
        }),
      ).enrichment,
    ).toBe(false);
  });
});
