import { Injectable } from '@nestjs/common';
import { ResearchProviderError } from '../../domain/knowledge-unit.types';

@Injectable()
export class AuthoritativeHttpClient {
  private readonly allowedHosts = new Set([
    'ar.wikipedia.org',
    'en.wikipedia.org',
    'www.wikidata.org',
  ]);

  async getJson<T>(
    url: URL,
    input: { timeoutMs: number; maxBytes: number },
  ): Promise<T> {
    if (url.protocol !== 'https:' || !this.allowedHosts.has(url.hostname))
      throw new ResearchProviderError(
        'PROVIDER_RESPONSE_INVALID',
        'RESEARCH_URL_NOT_ALLOWED',
      );
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(input.timeoutMs),
          headers: {
            'User-Agent':
              'Akwaan/1.0 (authoritative research; contact: admin@akwaan.local)',
            Accept: 'application/json',
          },
        });
        if (response.status === 429)
          throw new ResearchProviderError('PROVIDER_RATE_LIMITED');
        if (!response.ok) {
          if (response.status >= 500 && attempt === 0) {
            await this.delay(150);
            continue;
          }
          throw new ResearchProviderError(
            'PROVIDER_RESPONSE_INVALID',
            `HTTP_${response.status}`,
          );
        }
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > input.maxBytes)
          throw new ResearchProviderError('PROVIDER_RESPONSE_TOO_LARGE');
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > input.maxBytes)
          throw new ResearchProviderError('PROVIDER_RESPONSE_TOO_LARGE');
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new ResearchProviderError('PROVIDER_RESPONSE_INVALID');
        }
      } catch (error) {
        lastError = error;
        if (error instanceof ResearchProviderError) throw error;
        if (attempt === 0) {
          await this.delay(150);
          continue;
        }
      }
    }
    if (
      lastError instanceof Error &&
      /timeout|aborted/i.test(lastError.message)
    )
      throw new ResearchProviderError('PROVIDER_TIMEOUT');
    throw new ResearchProviderError('PROVIDER_RESPONSE_INVALID');
  }
  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
