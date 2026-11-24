import {
  DEFAULT_CAMPAIGN_ENDS_AT,
  campaignWindow,
  normaliseWeeklyLimit,
} from './launch-windows';

const at = (iso: string) =>
  campaignWindow(new Date(iso), DEFAULT_CAMPAIGN_ENDS_AT);

/**
 * The four weeks, exactly as the launch decision lists them. Times are Riyadh
 * (UTC+3): a Thursday 00:00 there is Wednesday 21:00 UTC.
 */
describe('the launch month’s weeks', () => {
  it('treats everything up to Wednesday 9 December as week one', () => {
    expect(at('2026-11-24T10:00:00+03:00').key).toBe('launch-week-1');
    expect(at('2026-12-01T00:00:00+03:00').key).toBe('launch-week-1');
    expect(at('2026-12-09T23:59:59+03:00').key).toBe('launch-week-1');
  });

  it('renews on each Thursday at midnight in Riyadh', () => {
    expect(at('2026-12-10T00:00:00+03:00').key).toBe('launch-week-2');
    expect(at('2026-12-16T23:59:59+03:00').key).toBe('launch-week-2');
    expect(at('2026-12-17T00:00:00+03:00').key).toBe('launch-week-3');
    expect(at('2026-12-24T00:00:00+03:00').key).toBe('launch-week-4');
    expect(at('2027-01-01T23:59:59+03:00').key).toBe('launch-week-4');
  });

  it('says when the count comes back', () => {
    expect(at('2026-12-05T12:00:00+03:00').renewsAt?.toISOString()).toBe(
      '2026-12-09T21:00:00.000Z',
    );
    expect(at('2026-12-12T12:00:00+03:00').renewsAt?.toISOString()).toBe(
      '2026-12-16T21:00:00.000Z',
    );
  });

  it('promises no renewal in the last week, which runs nine days', () => {
    expect(at('2026-12-18T12:00:00+03:00').renewsAt?.toISOString()).toBe(
      '2026-12-23T21:00:00.000Z',
    );
    expect(at('2026-12-25T12:00:00+03:00').renewsAt).toBeUndefined();
    // Thursday 31 December is not a refill: it is still week four.
    expect(at('2026-12-31T12:00:00+03:00').key).toBe('launch-week-4');
    expect(at('2026-12-31T12:00:00+03:00').renewsAt).toBeUndefined();
  });
});

describe('the weekly limit an operator sets', () => {
  it('keeps a sensible whole number', () => {
    expect(normaliseWeeklyLimit(2)).toBe(2);
    expect(normaliseWeeklyLimit('4')).toBe(4);
    expect(normaliseWeeklyLimit(0)).toBe(0);
  });

  it('falls back to 3 on anything unreadable, and caps a slip of the finger', () => {
    expect(normaliseWeeklyLimit(undefined)).toBe(3);
    expect(normaliseWeeklyLimit(-1)).toBe(3);
    expect(normaliseWeeklyLimit(2.5)).toBe(3);
    expect(normaliseWeeklyLimit(300)).toBe(10);
  });
});
