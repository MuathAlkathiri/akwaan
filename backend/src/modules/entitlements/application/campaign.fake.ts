import { CampaignRepository } from '../persistence/campaign.repository';

/**
 * The campaign's storage, held in memory, with the same promises the real one
 * makes: a slot is taken once, a code is used once per account, and a use is
 * only taken while one is left.
 */
export function fakeCampaignRepository() {
  const claims: {
    accountId: string;
    windowKey: string;
    slot: number;
    matchId: string;
  }[] = [];
  const codes = new Map<
    string,
    {
      code: string;
      tokens: number;
      maxRedemptions: number;
      redemptionCount: number;
      active: boolean;
      note?: string;
    }
  >();
  const redemptions = new Set<string>();
  let weekly: number | undefined;

  const repository = {
    claimedIn: async (accountId: string, windowKey: string) =>
      claims.filter(
        (claim) =>
          claim.accountId === accountId && claim.windowKey === windowKey,
      ).length,
    claimedEver: async (accountId: string) =>
      claims.filter((claim) => claim.accountId === accountId).length,
    claimOfMatch: async (matchId: string) =>
      claims.some((claim) => claim.matchId === matchId),
    claim: async (input: (typeof claims)[number]) => {
      const clash = claims.some(
        (claim) =>
          claim.matchId === input.matchId ||
          (claim.accountId === input.accountId &&
            claim.windowKey === input.windowKey &&
            claim.slot === input.slot),
      );
      if (clash) return false;
      claims.push(input);
      return true;
    },
    weeklyFreeMatches: async () => weekly,
    setWeeklyFreeMatches: async (value: number) => {
      weekly = value;
    },
    findCode: async (code: string) => codes.get(code) ?? null,
    listCodes: async () => [...codes.values()],
    createCode: async (input: {
      code: string;
      tokens: number;
      maxRedemptions: number;
      note?: string;
    }) => {
      if (codes.has(input.code)) return false;
      codes.set(input.code, { ...input, redemptionCount: 0, active: true });
      return true;
    },
    setCodeActive: async (code: string, active: boolean) => {
      const found = codes.get(code);
      if (!found) return false;
      found.active = active;
      return true;
    },
    recordRedemption: async (code: string, accountId: string) => {
      const key = `${code}:${accountId}`;
      if (redemptions.has(key)) return false;
      redemptions.add(key);
      return true;
    },
    forgetRedemption: async (code: string, accountId: string) => {
      redemptions.delete(`${code}:${accountId}`);
    },
    takeUse: async (code: string) => {
      const found = codes.get(code);
      if (!found || !found.active) return false;
      if (found.redemptionCount >= found.maxRedemptions) return false;
      found.redemptionCount += 1;
      return true;
    },
  };
  return {
    repository: repository as unknown as CampaignRepository,
    claims,
    codes,
  };
}
