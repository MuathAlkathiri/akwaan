import { ConfigService } from '@nestjs/config';
import { EnginePricingService } from './engine-pricing.service';
import {
  PricingUnavailableError,
  sarToMicros,
  MICROS_PER_SAR,
} from './content-engine.constants';

const configWith = (table?: string): ConfigService =>
  ({
    get: (key: string) => (key === 'ENGINE_MODEL_PRICING' ? table : undefined),
  }) as ConfigService;

/** 1 SAR per million in, 2 SAR per million out. */
const TABLE = JSON.stringify({
  'fake/fake-model': {
    inputMicrosPerMillion: MICROS_PER_SAR,
    outputMicrosPerMillion: 2 * MICROS_PER_SAR,
  },
});

describe('EnginePricingService', () => {
  it('refuses to price a model it has no rate for', () => {
    // Fail closed. The alternative — treating an unknown model as free — makes
    // the cap meaningless for exactly the models nobody configured.
    const pricing = new EnginePricingService(configWith(TABLE));
    expect(() => pricing.rate('fake', 'unconfigured')).toThrow(
      PricingUnavailableError,
    );
    expect(pricing.has('fake', 'unconfigured')).toBe(false);
  });

  it('treats a missing or malformed table as no pricing at all', () => {
    expect(() =>
      new EnginePricingService(configWith()).rate('fake', 'fake-model'),
    ).toThrow(PricingUnavailableError);
    expect(() =>
      new EnginePricingService(configWith('{not json')).rate(
        'fake',
        'fake-model',
      ),
    ).toThrow(PricingUnavailableError);
  });

  it('computes cost in integer micros', () => {
    const pricing = new EnginePricingService(configWith(TABLE));
    // 1M prompt @1 SAR + 0.5M completion @2 SAR = 1 + 1 = 2 SAR
    expect(
      pricing.costMicros('fake', 'fake-model', {
        promptTokens: 1_000_000,
        completionTokens: 500_000,
      }),
    ).toBe(sarToMicros(2));
  });

  it('rounds a fractional micro up, never down', () => {
    const pricing = new EnginePricingService(configWith(TABLE));
    const cost = pricing.costMicros('fake', 'fake-model', { promptTokens: 1 });
    expect(cost).toBe(1);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it('bills reasoning tokens at the output rate unless told otherwise', () => {
    const pricing = new EnginePricingService(configWith(TABLE));
    expect(
      pricing.costMicros('fake', 'fake-model', { reasoningTokens: 1_000_000 }),
    ).toBe(sarToMicros(2));
  });

  it('estimates against max output, so the reservation errs high', () => {
    const pricing = new EnginePricingService(configWith(TABLE));
    const estimate = pricing.estimateMicros('fake', 'fake-model', {
      promptTokens: 1_000_000,
      maxOutputTokens: 1_000_000,
    });
    const actualIfShort = pricing.costMicros('fake', 'fake-model', {
      promptTokens: 1_000_000,
      completionTokens: 10,
    });
    expect(estimate).toBeGreaterThan(actualIfShort);
  });
});
