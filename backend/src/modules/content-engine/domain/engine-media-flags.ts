import {
  CONTENT_ENGINE_ENABLED,
  ENGINE_IMAGE_GENERATION_ENABLED,
  ENGINE_MEDIA_DISCOVERY_BRAVE_API_KEY,
  ENGINE_MEDIA_DISCOVERY_COMMONS_ENABLED,
  ENGINE_MEDIA_DISCOVERY_WIKIDATA_ENABLED,
  ENGINE_MEDIA_VISION_CHECK_ENABLED,
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

/**
 * Commons discovery follows the same rule as the switches above: it is an
 * enrichment strategy, so it is on only when the engine, enrichment and its
 * own switch all are. Kept beside them rather than inside `EngineMediaFlags`
 * because that shape describes what may fill a slot automatically, and
 * discovery only ever proposes images for a person to choose from.
 */
export function commonsDiscoveryEnabled(
  config: FlagSource | undefined,
): boolean {
  return (
    resolveEngineMediaFlags(config).enrichment &&
    truthy(config, ENGINE_MEDIA_DISCOVERY_COMMONS_ENABLED)
  );
}

/** Wikidata discovery, under the same three switches as Commons discovery. */
export function wikidataDiscoveryEnabled(
  config: FlagSource | undefined,
): boolean {
  return (
    resolveEngineMediaFlags(config).enrichment &&
    truthy(config, ENGINE_MEDIA_DISCOVERY_WIKIDATA_ENABLED)
  );
}

/** The Brave key, only while enrichment is on; null switches the provider off. */
export function braveDiscoveryKey(
  config: FlagSource | undefined,
): string | null {
  if (!resolveEngineMediaFlags(config).enrichment) return null;
  const key = String(
    config?.get<string>(ENGINE_MEDIA_DISCOVERY_BRAVE_API_KEY) ?? '',
  ).trim();
  return key || null;
}

/** The answer-visibility check, an enrichment step like discovery itself. */
export function mediaVisionCheckEnabled(
  config: FlagSource | undefined,
): boolean {
  return (
    resolveEngineMediaFlags(config).enrichment &&
    truthy(config, ENGINE_MEDIA_VISION_CHECK_ENABLED)
  );
}
