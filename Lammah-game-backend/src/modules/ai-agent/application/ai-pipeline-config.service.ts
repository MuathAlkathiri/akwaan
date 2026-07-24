import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiPipelineConfigService {
  constructor(private readonly config: ConfigService) {}
  readonly batchSize = 6;
  concurrency() {
    return this.integer('AI_GENERATION_CONCURRENCY', 2, 1, 8);
  }
  researchConcurrency() {
    return this.integer('AI_RESEARCH_CONCURRENCY', 2, 1, 6);
  }
  duplicateRetries() {
    return this.integer('AI_DUPLICATE_RETRY_ATTEMPTS', 2, 0, 5);
  }
  repairAttempts() {
    return this.integer('AI_MAX_REPAIR_ATTEMPTS', 2, 0, 2);
  }
  cacheTtlSeconds(freshness: 'static' | 'seasonal' | 'live') {
    const defaults = { static: 2_592_000, seasonal: 86_400, live: 900 };
    return this.integer(
      `AI_KNOWLEDGE_TTL_${freshness.toUpperCase()}_SECONDS`,
      defaults[freshness],
      60,
      31_536_000,
    );
  }
  wikipedia() {
    return {
      enabled: this.boolean('AI_WIKIPEDIA_ENABLED', true),
      timeoutMs: this.integer('AI_WIKIPEDIA_TIMEOUT_MS', 10_000, 500, 60_000),
      maxResults: this.integer('AI_WIKIPEDIA_MAX_RESULTS', 5, 1, 10),
      maxExtractChars: this.integer(
        'AI_WIKIPEDIA_MAX_EXTRACT_CHARS',
        12_000,
        500,
        50_000,
      ),
      languages: this.languages('AI_WIKIPEDIA_LANGUAGES', ['ar', 'en']),
    };
  }
  wikidata() {
    return {
      enabled: this.boolean('AI_WIKIDATA_ENABLED', true),
      timeoutMs: this.integer('AI_WIKIDATA_TIMEOUT_MS', 10_000, 500, 60_000),
      maxEntities: this.integer('AI_WIKIDATA_MAX_ENTITIES', 10, 1, 20),
      maxFactsPerEntity: this.integer(
        'AI_WIKIDATA_MAX_FACTS_PER_ENTITY',
        30,
        1,
        50,
      ),
    };
  }
  private boolean(key: string, fallback: boolean) {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === '') return fallback;
    if (!/^(true|false|1|0)$/i.test(raw))
      throw new Error(`${key} must be a boolean`);
    return /^(true|1)$/i.test(raw);
  }
  private languages(key: string, fallback: string[]) {
    const values = (this.config.get<string>(key) ?? fallback.join(','))
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!values.length || values.some((value) => !/^[a-z]{2,3}$/.test(value)))
      throw new Error(`${key} must contain comma-separated language codes`);
    return [...new Set(values)];
  }
  private integer(key: string, fallback: number, min: number, max: number) {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key} must be an integer between ${min} and ${max}`);
    return value;
  }
}
