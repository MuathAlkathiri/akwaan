import {
  DiscountCode,
  MIN_CHARGE_HALALAS,
  normaliseCode,
  quoteWithCode,
} from './discount-code';
import { TokenPack } from './token-pack';

const single: TokenPack = {
  id: 'single',
  tokens: 1,
  priceHalalas: 1500,
  label: 'مباراة وحدة',
};
const fifteen: TokenPack = {
  id: 'fifteen',
  tokens: 15,
  priceHalalas: 15000,
  label: '15 مباراة',
};

const NOW = new Date('2026-12-05T10:00:00.000Z');

function code(over: Partial<DiscountCode> = {}): DiscountCode {
  return {
    code: 'AKWAAN20',
    percentOff: 20,
    packIds: [],
    maxRedemptions: null,
    redeemedCount: 0,
    active: true,
    ...over,
  };
}

describe('normaliseCode', () => {
  it('matches however the player typed it', () => {
    expect(normaliseCode('  akwaan20 ')).toBe('AKWAAN20');
  });
});

describe('quoteWithCode', () => {
  it('charges the list price when no code is offered', () => {
    const quote = quoteWithCode(single, undefined, NOW);
    expect(quote.totalHalalas).toBe(1500);
    expect(quote.discountHalalas).toBe(0);
    expect(quote.code).toBeUndefined();
  });

  it('takes a percentage off', () => {
    const quote = quoteWithCode(fifteen, code(), NOW);
    expect(quote.discountHalalas).toBe(3000);
    expect(quote.totalHalalas).toBe(12000);
    expect(quote.code).toBe('AKWAAN20');
  });

  it('takes a fixed amount off', () => {
    const quote = quoteWithCode(
      fifteen,
      code({ percentOff: undefined, amountOffHalalas: 2500 }),
      NOW,
    );
    expect(quote.totalHalalas).toBe(12500);
  });

  it('rounds a part-halala percentage down, in the player’s favour', () => {
    // 33% of 1500 is 495, exactly; 33% of 1501 would be 495.33.
    const quote = quoteWithCode(
      { ...single, priceHalalas: 1501 },
      code({ percentOff: 33 }),
      NOW,
    );
    expect(quote.discountHalalas).toBe(495);
    expect(quote.totalHalalas).toBe(1006);
  });

  it('refuses a code that would take the charge under the provider floor', () => {
    const quote = quoteWithCode(single, code({ percentOff: 95 }), NOW);
    expect(quote.refused).toBe('too-small');
    // and the player is still quoted the honest price, not a clamped one
    expect(quote.totalHalalas).toBe(1500);
    expect(1500 - 1425).toBeLessThan(MIN_CHARGE_HALALAS);
  });

  it('never discounts past free', () => {
    const quote = quoteWithCode(
      fifteen,
      code({ percentOff: undefined, amountOffHalalas: 99_999 }),
      NOW,
    );
    expect(quote.refused).toBe('too-small');
  });

  it('refuses an expired code', () => {
    const quote = quoteWithCode(
      fifteen,
      code({ expiresAt: new Date('2026-12-01T00:00:00.000Z') }),
      NOW,
    );
    expect(quote.refused).toBe('expired');
    expect(quote.totalHalalas).toBe(15000);
  });

  it('refuses a deactivated code', () => {
    expect(quoteWithCode(fifteen, code({ active: false }), NOW).refused).toBe(
      'inactive',
    );
  });

  it('refuses a code that has been used up', () => {
    const quote = quoteWithCode(
      fifteen,
      code({ maxRedemptions: 50, redeemedCount: 50 }),
      NOW,
    );
    expect(quote.refused).toBe('used-up');
  });

  it('allows a code with redemptions left', () => {
    const quote = quoteWithCode(
      fifteen,
      code({ maxRedemptions: 50, redeemedCount: 49 }),
      NOW,
    );
    expect(quote.refused).toBeUndefined();
    expect(quote.totalHalalas).toBe(12000);
  });

  it('refuses a code scoped to another pack', () => {
    const quote = quoteWithCode(single, code({ packIds: ['fifteen'] }), NOW);
    expect(quote.refused).toBe('wrong-pack');
  });

  it('applies a scoped code on the pack it names', () => {
    const quote = quoteWithCode(fifteen, code({ packIds: ['fifteen'] }), NOW);
    expect(quote.totalHalalas).toBe(12000);
  });
});
