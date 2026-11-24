import { ConfigService } from '@nestjs/config';
import { LaunchCampaignService } from './launch-campaign.service';
import { TokenLedgerService } from './token-ledger.service';
import { fakeCampaignRepository } from './campaign.fake';

function campaign(
  env: Record<string, string | undefined> = {},
  history: { entry: { reason: string } }[] = [],
) {
  const store = fakeCampaignRepository();
  const service = new LaunchCampaignService(
    { history: async () => history } as unknown as TokenLedgerService,
    { get: (key: string) => env[key] } as unknown as ConfigService,
    store.repository,
  );
  return { service, ...store };
}

const WEEK_1 = new Date('2026-12-02T12:00:00+03:00');
const WEEK_2 = new Date('2026-12-11T12:00:00+03:00');
const AFTER = new Date('2027-01-05T12:00:00+03:00');

describe('the launch month', () => {
  it('runs until the end of 1 January 2027 unless told otherwise', () => {
    const { service } = campaign();
    expect(service.status(WEEK_1)).toEqual({
      open: true,
      endsAt: '2027-01-01T21:00:00.000Z',
    });
    expect(service.status(AFTER)).toEqual({ open: false });
  });

  it('can be closed early by configuration, which is how paid play is tested', () => {
    const { service } = campaign({
      LAUNCH_CAMPAIGN_ENDS_AT: '2026-01-01T00:00:00.000Z',
    });
    expect(service.status(WEEK_1)).toEqual({ open: false });
  });

  it('keeps the planned end when the configured one cannot be read', () => {
    const { service } = campaign({ LAUNCH_CAMPAIGN_ENDS_AT: 'new year' });
    expect(service.status(WEEK_1).open).toBe(true);
  });
});

describe('three free Matches a week', () => {
  it('gives three, then stops', async () => {
    const { service } = campaign();
    for (const match of ['m1', 'm2', 'm3']) {
      await expect(service.claimFreeMatch('acc', match, WEEK_1)).resolves.toBe(
        true,
      );
    }
    await expect(service.claimFreeMatch('acc', 'm4', WEEK_1)).resolves.toBe(
      false,
    );
    await expect(service.allowanceFor('acc', WEEK_1)).resolves.toMatchObject({
      limit: 3,
      used: 3,
      remaining: 0,
      renewsAt: '2026-12-09T21:00:00.000Z',
    });
  });

  it('comes back to three on Thursday, with nothing carried over', async () => {
    const { service } = campaign();
    // One played in week one: the two left over are simply gone.
    await service.claimFreeMatch('acc', 'm1', WEEK_1);
    await expect(service.allowanceFor('acc', WEEK_2)).resolves.toMatchObject({
      used: 0,
      remaining: 3,
    });
  });

  it('counts each account on its own', async () => {
    const { service } = campaign();
    for (const match of ['a1', 'a2', 'a3']) {
      await service.claimFreeMatch('first', match, WEEK_1);
    }
    await expect(service.claimFreeMatch('second', 'b1', WEEK_1)).resolves.toBe(
      true,
    );
  });

  it('does not use a second free Match when the same one is asked for again', async () => {
    const { service, claims } = campaign();
    await service.claimFreeMatch('acc', 'm1', WEEK_1);
    await expect(service.claimFreeMatch('acc', 'm1', WEEK_1)).resolves.toBe(
      true,
    );
    expect(claims).toHaveLength(1);
  });

  it('follows the number an operator sets, without a deploy', async () => {
    const { service } = campaign();
    await expect(service.setWeeklyLimit(2, 'admin-1')).resolves.toBe(2);
    await service.claimFreeMatch('acc', 'm1', WEEK_1);
    await service.claimFreeMatch('acc', 'm2', WEEK_1);
    await expect(service.claimFreeMatch('acc', 'm3', WEEK_1)).resolves.toBe(
      false,
    );
  });

  it('reports nothing weekly once the campaign is over', async () => {
    const { service } = campaign();
    await expect(service.allowanceFor('acc', AFTER)).resolves.toBeUndefined();
  });
});

describe('the first Match is always free', () => {
  it('is free after the campaign for an account that has never played', async () => {
    const { service } = campaign();
    await expect(service.claimFreeMatch('new', 'm1', AFTER)).resolves.toBe(
      true,
    );
    await expect(service.claimFreeMatch('new', 'm2', AFTER)).resolves.toBe(
      false,
    );
  });

  it('is not given again to an account that played during the campaign', async () => {
    const { service } = campaign();
    await service.claimFreeMatch('acc', 'm1', WEEK_1);
    await expect(service.claimFreeMatch('acc', 'm2', AFTER)).resolves.toBe(
      false,
    );
  });

  it('is not given to an account that has already paid for one', async () => {
    const { service } = campaign({}, [{ entry: { reason: 'match.start' } }]);
    await expect(service.claimFreeMatch('acc', 'm1', AFTER)).resolves.toBe(
      false,
    );
  });
});

describe('when the shop may sell', () => {
  it('sells only once somebody has switched it on', () => {
    expect(campaign().service.salesOpen()).toBe(false);
    expect(campaign({ SALES_OPEN: 'true' }).service.salesOpen()).toBe(true);
    // The campaign ending is not the switch.
    expect(
      campaign({
        LAUNCH_CAMPAIGN_ENDS_AT: '2026-01-01T00:00:00.000Z',
      }).service.salesOpen(),
    ).toBe(false);
  });
});
