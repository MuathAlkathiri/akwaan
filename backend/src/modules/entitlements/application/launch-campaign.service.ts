import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongoose';
import { CampaignRepository } from '../persistence/campaign.repository';
import {
  DEFAULT_CAMPAIGN_ENDS_AT,
  DEFAULT_WEEKLY_FREE_MATCHES,
  campaignWindow,
  normaliseWeeklyLimit,
} from '../domain/launch-windows';
import { TokenLedgerService } from './token-ledger.service';

/** The window name of the one free Match every account gets, ever. */
const FIRST_MATCH_WINDOW = 'first-match';

/** How often a lost race for a slot is retried before giving up on it. */
const CLAIM_ATTEMPTS = 4;

export interface WeeklyAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** When the count goes back to full. Absent in the campaign's last week. */
  renewsAt?: string;
}

/**
 * Which Matches are free.
 *
 * Two rules live here, and nothing else in the product decides either.
 *
 * The launch month: until the end of 1 January 2027 every account may start a
 * set number of Matches a week for nothing. They are never a balance — the
 * count is read from what the account has already started this week — so
 * there is nothing to carry over and nothing left behind when the month ends.
 *
 * The standing rule: an account's very first Match is free, before, during
 * and after the campaign. During it, that Match is simply one of the week's.
 *
 * A Match that is not free under either rule is paid for from the balance,
 * which is the caller's business, not this service's.
 *
 * `LAUNCH_CAMPAIGN_ENDS_AT` (ISO 8601) overrides the end. A date in the past
 * closes the campaign, which is how a test environment exercises paid play.
 */
@Injectable()
export class LaunchCampaignService {
  private readonly logger = new Logger(LaunchCampaignService.name);

  constructor(
    private readonly tokens: TokenLedgerService,
    private readonly config: ConfigService,
    private readonly campaign: CampaignRepository,
  ) {}

  /** Whether the free month is running, and when it closes. */
  status(now: Date): { open: boolean; endsAt?: string } {
    const endsAt = this.endsAt();
    return now.getTime() < endsAt
      ? { open: true, endsAt: new Date(endsAt).toISOString() }
      : { open: false };
  }

  /**
   * Whether the shop may take money.
   *
   * A switch somebody throws, never a date that arrives. Selling waits on
   * things no calendar knows: live payment keys, a verified webhook, and no
   * fault left that costs a player a round.
   */
  salesOpen(): boolean {
    return this.config.get<string>('SALES_OPEN') === 'true';
  }

  async weeklyLimit(): Promise<number> {
    const stored = await this.campaign.weeklyFreeMatches();
    return stored === undefined
      ? DEFAULT_WEEKLY_FREE_MATCHES
      : normaliseWeeklyLimit(stored);
  }

  async setWeeklyLimit(value: number, operatorId: string): Promise<number> {
    const limit = normaliseWeeklyLimit(value);
    await this.campaign.setWeeklyFreeMatches(limit, operatorId);
    this.logger.log({
      event: 'campaign_weekly_limit_changed',
      limit,
      operatorId,
    });
    return limit;
  }

  /** What this account still has this week. Absent once the campaign is over. */
  async allowanceFor(
    accountId: string,
    now: Date,
  ): Promise<WeeklyAllowance | undefined> {
    if (!this.status(now).open) return undefined;
    const window = campaignWindow(now, this.endsAt());
    const [limit, used] = await Promise.all([
      this.weeklyLimit(),
      this.campaign.claimedIn(accountId, window.key),
    ]);
    return {
      limit,
      used: Math.min(used, limit),
      remaining: Math.max(limit - used, 0),
      ...(window.renewsAt ? { renewsAt: window.renewsAt.toISOString() } : {}),
    };
  }

  /**
   * Makes this Match free, if a rule says it is.
   *
   * True means nothing is to be charged. Asking again for the same Match is
   * safe and answers the same way, so a retried request cannot use a second
   * free Match — or be charged for one that was already free.
   */
  async claimFreeMatch(
    accountId: string,
    matchId: string,
    now: Date,
    transaction?: ClientSession,
  ): Promise<boolean> {
    if (await this.campaign.claimOfMatch(matchId, transaction)) return true;

    if (this.status(now).open) {
      const window = campaignWindow(now, this.endsAt());
      const limit = await this.weeklyLimit();
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
        const used = await this.campaign.claimedIn(
          accountId,
          window.key,
          transaction,
        );
        if (used >= limit) break;
        const taken = await this.campaign.claim(
          { accountId, windowKey: window.key, slot: used + 1, matchId },
          transaction,
        );
        if (taken) {
          this.logger.log({
            event: 'campaign_free_match_claimed',
            accountId,
            matchId,
            window: window.key,
            slot: used + 1,
          });
          return true;
        }
      }
    }

    return this.claimFirstMatch(accountId, matchId, transaction);
  }

  /**
   * The one Match every account gets for nothing.
   *
   * "First" means the account has never started one, free or paid — so an
   * account that played through the launch month does not get another when it
   * ends, and one that bought before ever playing still gets this.
   */
  private async claimFirstMatch(
    accountId: string,
    matchId: string,
    transaction?: ClientSession,
  ): Promise<boolean> {
    if ((await this.campaign.claimedEver(accountId, transaction)) > 0) {
      return false;
    }
    const history = await this.tokens.history(accountId, 200);
    if (history.some((movement) => movement.entry.reason === 'match.start')) {
      return false;
    }
    return this.campaign.claim(
      { accountId, windowKey: FIRST_MATCH_WINDOW, slot: 1, matchId },
      transaction,
    );
  }

  private endsAt(): number {
    const configured = this.config.get<string>('LAUNCH_CAMPAIGN_ENDS_AT');
    if (!configured) return DEFAULT_CAMPAIGN_ENDS_AT;
    const parsed = Date.parse(configured);
    if (Number.isNaN(parsed)) {
      // A misread date must not quietly end the campaign: say so, and keep
      // the end the plan names.
      this.logger.warn({
        event: 'campaign_end_unreadable',
        configured,
      });
      return DEFAULT_CAMPAIGN_ENDS_AT;
    }
    return parsed;
  }
}
