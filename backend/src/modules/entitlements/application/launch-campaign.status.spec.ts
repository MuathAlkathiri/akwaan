import { ConfigService } from '@nestjs/config';
import { LaunchCampaignService } from './launch-campaign.service';
import { TokenLedgerService } from './token-ledger.service';

/**
 * Whether the shop may sell.
 *
 * While the launch month runs, Matches are free and balances are not
 * consumed, so selling would charge a player for what they already have. The
 * shop reads this, which makes it worth pinning on its own.
 */
const campaign = (endsAt?: string) =>
  new LaunchCampaignService(
    {} as unknown as TokenLedgerService,
    {
      get: (key: string) =>
        key === 'LAUNCH_CAMPAIGN_ENDS_AT' ? endsAt : undefined,
    } as unknown as ConfigService,
  );

const NOW = new Date('2026-11-23T00:00:00Z');

describe('the launch campaign, as the shop sees it', () => {
  it('is open while no end date is set', () => {
    // Unset means open on purpose: an account that cannot play because an
    // operator forgot a variable is worse than one that plays free.
    expect(campaign().status(NOW)).toEqual({ open: true });
  });

  it('is open before its end, and says when that is', () => {
    expect(campaign('2026-12-31T20:59:59.000Z').status(NOW)).toEqual({
      open: true,
      endsAt: '2026-12-31T20:59:59.000Z',
    });
  });

  it('is closed after its end', () => {
    expect(campaign('2026-11-01T00:00:00.000Z').status(NOW)).toEqual({
      open: false,
    });
  });

  it('stays open on an unreadable date rather than guessing', () => {
    expect(campaign('the end of december').status(NOW)).toEqual({
      open: true,
    });
  });
});
