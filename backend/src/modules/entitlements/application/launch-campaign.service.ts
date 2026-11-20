import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongoose';
import { TokenLedgerService } from './token-ledger.service';

/** How many tokens the launch month hands an account that turns up. */
const DEFAULT_CAMPAIGN_TOKENS = 60;

/**
 * The launch month: everyone plays, nobody pays, and the ledger still runs.
 *
 * The month could have been built by skipping the token check entirely, and
 * that is the version that breaks on the day it ends — because the path that
 * charges a player would then be running for the first time, in production,
 * against real accounts. Granting an allowance instead means the charge, the
 * balance and the record are exercised from the first Match. Ending the
 * campaign is then a date in the environment, not a code path nobody has run.
 *
 * `LAUNCH_CAMPAIGN_ENDS_AT` (ISO 8601) closes it: after that moment an account
 * that has never played gets nothing and has to buy. Unset means open, which is
 * the right default while the month is the plan — an account that cannot play
 * because an operator forgot a variable is worse than one that plays free.
 */
@Injectable()
export class LaunchCampaignService {
  private readonly logger = new Logger(LaunchCampaignService.name);

  constructor(
    private readonly tokens: TokenLedgerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Gives this account its launch allowance, once, if the campaign is open.
   *
   * Keyed on the account, so it cannot be collected twice however often this is
   * called — and it is called on every Match, because an account created before
   * the campaign started should still get it the first time it plays.
   */
  async grantAllowanceIfDue(
    accountId: string,
    now: Date,
    transaction?: ClientSession,
  ): Promise<void> {
    if (!this.isOpen(now)) return;
    const amount = this.tokenCount();
    const movement = await this.tokens.grant({
      accountId,
      amount,
      reason: 'campaign.launch-month',
      reference: 'launch-month',
      idempotencyKey: `campaign:${accountId}`,
      transaction,
    });
    if (movement.balanceAfter === amount) {
      this.logger.log({ event: 'campaign_allowance_granted', accountId, amount });
    }
  }

  private isOpen(now: Date): boolean {
    const endsAt = this.config.get<string>('LAUNCH_CAMPAIGN_ENDS_AT');
    if (!endsAt) return true;
    const closesAt = Date.parse(endsAt);
    if (Number.isNaN(closesAt)) {
      // A misread date must not quietly hand out tokens forever, nor quietly
      // stop: say so, and keep the campaign open, which is the state the
      // operator last chose on purpose.
      this.logger.warn({
        event: 'campaign_end_unreadable',
        configured: endsAt,
      });
      return true;
    }
    return now.getTime() < closesAt;
  }

  private tokenCount(): number {
    const configured = Number(
      this.config.get<string>('LAUNCH_CAMPAIGN_TOKENS'),
    );
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_CAMPAIGN_TOKENS;
  }
}
