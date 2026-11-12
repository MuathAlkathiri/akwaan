import {
  CONTENT_ENGINE_ENABLED,
  ENGINE_IMAGE_GENERATION_ENABLED,
  ENGINE_MEDIA_DISCOVERY_WIGOLO_ENABLED,
  ENGINE_MEDIA_ENRICHMENT_ENABLED,
} from './content-engine.constants';

export interface EngineMediaFlags {
  enrichment: boolean;
  imageGeneration: boolean;
  wigoloDiscovery: boolean;
}

interface FlagSource {
  get<T = string>(key: string): T | undefined;
}

const truthy = (config: FlagSource | undefined, key: string): boolean =>
  ['true', '1', 'yes', 'on'].includes(
    String(config?.get<string>(key) ?? '')
      .trim()
      .toLowerCase(),
  );

/**
 * The media switches, resolved fail-closed.
 *
 * Every switch is dependent on the one above it: image generation and Wigolo
 * discovery are enrichment strategies, and enrichment is part of the engine.
 * Turning a lower switch on without its parent therefore changes nothing, so a
 * stray variable on a deployment cannot authorize a paid or external call.
 */
export function resolveEngineMediaFlags(
  config: FlagSource | undefined,
): EngineMediaFlags {
  const enrichment =
    truthy(config, CONTENT_ENGINE_ENABLED) &&
    truthy(config, ENGINE_MEDIA_ENRICHMENT_ENABLED);
  return {
    enrichment,
    imageGeneration:
      enrichment && truthy(config, ENGINE_IMAGE_GENERATION_ENABLED),
    wigoloDiscovery:
      enrichment && truthy(config, ENGINE_MEDIA_DISCOVERY_WIGOLO_ENABLED),
  };
}
