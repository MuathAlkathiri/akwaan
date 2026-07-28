import { Injectable } from '@nestjs/common';
import { LiveSessionDomainError } from '../domain/live-session.errors';

@Injectable()
export class PublicJoinRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  consume(key: string, maximum: number, windowMs = 60_000): void {
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recent.length >= maximum) {
      throw new LiveSessionDomainError(
        'JOIN_RATE_EXCEEDED',
        'Too many join requests. Try again shortly.',
      );
    }
    recent.push(now);
    this.attempts.set(key, recent);
    if (this.attempts.size > 5_000) {
      const oldestKey = this.attempts.keys().next().value;
      if (typeof oldestKey === 'string') this.attempts.delete(oldestKey);
    }
  }
}
