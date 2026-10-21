import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PricingUnavailableError } from './content-engine.constants';

/** Token counts as a provider reports them. */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  /** Reasoning/thinking tokens, where a provider bills them separately. */
  reasoningTokens?: number;
}

export interface ModelRate {
  /** Micros of SAR per million input tokens. */
  inputMicrosPerMillion: number;
  /** Micros of SAR per million output tokens. */
  outputMicrosPerMillion: number;
  /** Defaults to the output rate when a provider bills reasoning as output. */
  reasoningMicrosPerMillion?: number;
}

/**
 * What a call costs, from configuration only.
 *
 * Prices are **not** compiled in. They change without notice, they differ per
 * account and region, and a stale constant in the repository would quietly
 * mis-state every number the cap depends on. `ENGINE_MODEL_PRICING` is a JSON
 * map of `"provider/model"` to rates, supplied by deployment.
 *
 * No rate configured means `PricingUnavailableError`, never zero.
 */
@Injectable()
export class EnginePricingService {
  private cache?: Record<string, ModelRate>;

  constructor(private readonly config: ConfigService) {}

  private table(): Record<string, ModelRate> {
    if (this.cache) return this.cache;
    const raw = this.config.get<string>('ENGINE_MODEL_PRICING')?.trim();
    if (!raw) {
      this.cache = {};
      return this.cache;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, ModelRate>;
      this.cache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      // A malformed table is treated as no table: fail closed rather than
      // silently pricing half the models at zero.
      this.cache = {};
    }
    return this.cache;
  }

  has(provider: string, model: string): boolean {
    return Boolean(this.table()[`${provider}/${model}`]);
  }

  rate(provider: string, model: string): ModelRate {
    const found = this.table()[`${provider}/${model}`];
    if (!found) throw new PricingUnavailableError(provider, model);
    return found;
  }

  /**
   * Cost in micros, rounded **up**.
   *
   * Rounding up by a fraction of a micro per call is irrelevant to the bill and
   * keeps the ledger from drifting below the real cost across thousands of
   * calls, which is the direction that matters next to a cap.
   */
  costMicros(provider: string, model: string, usage: TokenUsage): number {
    const rate = this.rate(provider, model);
    const reasoningRate =
      rate.reasoningMicrosPerMillion ?? rate.outputMicrosPerMillion;
    const micros =
      ((usage.promptTokens ?? 0) * rate.inputMicrosPerMillion +
        (usage.completionTokens ?? 0) * rate.outputMicrosPerMillion +
        (usage.reasoningTokens ?? 0) * reasoningRate) /
      1_000_000;
    return Math.ceil(micros);
  }

  /**
   * What to reserve before a call whose usage nobody knows yet.
   *
   * Deliberately an over-estimate: a reservation that is too small lets the
   * actual bill land above the cap, and the engine cannot un-spend it.
   */
  estimateMicros(
    provider: string,
    model: string,
    expected: { promptTokens: number; maxOutputTokens: number },
  ): number {
    return this.costMicros(provider, model, {
      promptTokens: expected.promptTokens,
      completionTokens: expected.maxOutputTokens,
    });
  }
}
