/**
 * The launch month, cut into its weeks.
 *
 * From 1 December 2026 until the end of 1 January 2027 every account may start
 * a fixed number of Matches a week without spending anything. The count
 * renews on Thursday and nothing carries over, which is the whole defence
 * against stockpiling: there is never anything stored to stockpile.
 *
 * All of it is arithmetic on fixed instants, so there is no scheduled job to
 * forget and nothing to reset. "This week" is whichever window `now` falls in.
 *
 * Riyadh has no daylight saving, so a Thursday midnight there is always
 * Wednesday 21:00 UTC and the constants below never drift.
 */

/** Thursday 10 December 2026, 00:00 in Riyadh: the first renewal. */
export const FIRST_RENEWAL_AT = Date.parse('2026-12-09T21:00:00.000Z');

/** The end of Friday 1 January 2027 in Riyadh. */
export const DEFAULT_CAMPAIGN_ENDS_AT = Date.parse('2027-01-01T21:00:00.000Z');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Weeks are numbered from zero; the campaign has four. */
const LAST_WEEK_INDEX = 3;

export const DEFAULT_WEEKLY_FREE_MATCHES = 3;
export const MAX_WEEKLY_FREE_MATCHES = 10;

export interface CampaignWindow {
  /** Stable name of the week: what a free Match is counted against. */
  key: string;
  /** When the count goes back to full. Absent in the last week. */
  renewsAt?: Date;
}

/**
 * Which week `now` belongs to.
 *
 * Everything before the first renewal is week one — including the days before
 * launch, so the rule can be played against before 1 December rather than
 * running for the first time in front of real players.
 */
export function campaignWindow(now: Date, endsAt: number): CampaignWindow {
  const at = now.getTime();
  const elapsed =
    at < FIRST_RENEWAL_AT
      ? 0
      : 1 + Math.floor((at - FIRST_RENEWAL_AT) / WEEK_MS);
  // Four weeks and no fifth: the last one runs from Thursday 24 December to
  // the end, nine days long, so an account tops out at four refills.
  const index = Math.min(elapsed, LAST_WEEK_INDEX);
  const renewal = FIRST_RENEWAL_AT + index * WEEK_MS;
  return {
    key: `launch-week-${index + 1}`,
    ...(index < LAST_WEEK_INDEX && renewal < endsAt
      ? { renewsAt: new Date(renewal) }
      : {}),
  };
}

/** Clamps whatever an operator typed to something the campaign can honour. */
export function normaliseWeeklyLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_WEEKLY_FREE_MATCHES;
  }
  return Math.min(parsed, MAX_WEEKLY_FREE_MATCHES);
}
