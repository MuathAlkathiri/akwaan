import { Injectable } from '@nestjs/common';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * A sliding window per key, in this process's memory.
 *
 * Deliberately the same shape as the existing `PublicJoinRateLimiter` rather
 * than a new framework: the beta runs a single instance, so a shared store
 * would add a dependency without adding protection. That assumption is worth
 * stating because it is the thing that breaks first when the API scales out —
 * at that point this becomes Redis, and only this class changes.
 */
@Injectable()
export class OtpRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private static readonly MAX_KEYS = 10_000;

  check(key: string, maximum: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < windowMs,
    );
    if (recent.length >= maximum) {
      const oldest = recent[0];
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowMs - (now - oldest)) / 1000),
        ),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  record(key: string, windowMs: number): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < windowMs,
    );
    recent.push(now);
    this.hits.set(key, recent);
    this.evictIfCrowded();
  }

  /** Test seam; also used when a verification succeeds and the key is spent. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /**
   * Bounded so a flood of distinct identifiers cannot grow this without limit.
   * Oldest insertion goes first — Map preserves insertion order.
   */
  private evictIfCrowded(): void {
    if (this.hits.size <= OtpRateLimiter.MAX_KEYS) return;
    const oldest = this.hits.keys().next().value;
    if (typeof oldest === 'string') this.hits.delete(oldest);
  }
}
