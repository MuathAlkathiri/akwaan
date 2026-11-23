import { Types } from 'mongoose';
import { WorldRemainingService } from './world-remaining.service';
import { ContentExposureRepository } from '../persistence/content-exposure.repository';
import { WorldRemainingRepository } from '../persistence/world-remaining.repository';

/**
 * What a World still owes a player.
 *
 * The rule under test is the whole point of the feature: a question is spent
 * only once the player has been shown it in EVERY challenge it can be played
 * through. A question seen in القنبلة is still owed in اقرأ خصمك, because the
 * same fact asked a different way is a different experience — the exposure
 * ledger already works that way, and a counter that disagreed with it would be
 * telling the player they have less left than they really do.
 */
const BOMB = new Types.ObjectId();
const RYO = new Types.ObjectId();
const WORLD = new Types.ObjectId();
const ITEM = new Types.ObjectId();

const slugs = new Map([
  [BOMB.toString(), 'bomb'],
  [RYO.toString(), 'read-your-opponent'],
]);

/** A Mongoose `find(...).lean().exec()` chain that answers with these rows. */
const finding = (rows: unknown[]) => ({
  find: jest.fn().mockReturnValue({
    lean: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(rows) }),
  }),
  countDocuments: jest.fn().mockResolvedValue(0),
});

const build = (input: {
  items: unknown[];
  exposedKeys: Map<string, Set<string>>;
  totalReady?: number;
  seenItemIds?: string[];
  stored?: Array<{
    worldId: string;
    remaining: number;
    totalReady: number;
    exhausted: number;
    rebuiltAt: Date;
  }>;
}) => {
  const items = finding(input.items);
  items.countDocuments = jest.fn().mockResolvedValue(input.totalReady ?? 0);
  const challengeTypes = finding(
    [...slugs].map(([id, slug]) => ({ _id: new Types.ObjectId(id), slug })),
  );
  const exposures = {
    exposedChallengeKeysByItem: jest.fn().mockResolvedValue(input.exposedKeys),
    exposedContentItemIds: jest.fn().mockResolvedValue(input.seenItemIds ?? []),
  } as unknown as ContentExposureRepository;
  const spend = jest.fn().mockResolvedValue(true);
  const put = jest.fn().mockResolvedValue(undefined);
  const forget = jest.fn().mockResolvedValue(undefined);
  const summaries = {
    findForAccount: jest.fn().mockResolvedValue(input.stored ?? []),
    put,
    spend,
    forget,
  } as unknown as WorldRemainingRepository;
  const service = new WorldRemainingService(
    items as never,
    challengeTypes as never,
    exposures,
    summaries,
  );
  return { service, spend, put, forget, items };
};

const itemPlayableInBoth = {
  _id: ITEM,
  worldId: WORLD,
  compatibleChallengeTypeIds: [BOMB, RYO],
};

describe('what counts as a spent question', () => {
  it('does not spend a question still owed in another challenge', async () => {
    const { service, spend } = build({
      items: [itemPlayableInBoth],
      exposedKeys: new Map([[ITEM.toString(), new Set(['bomb'])]]),
    });
    await service.noteExposed('acc-1', [ITEM.toString()]);
    expect(spend).not.toHaveBeenCalled();
  });

  it('spends it once every challenge it can appear in has shown it', async () => {
    const { service, spend } = build({
      items: [itemPlayableInBoth],
      exposedKeys: new Map([
        [ITEM.toString(), new Set(['bomb', 'read-your-opponent'])],
      ]),
    });
    await service.noteExposed('acc-1', [ITEM.toString()]);
    expect(spend).toHaveBeenCalledWith('acc-1', WORLD.toString(), 1);
  });

  it('never spends a question no challenge can play', async () => {
    // Compatible with nothing: it was never owed, so subtracting it would take
    // away a question the player never had a chance at.
    const { service, spend } = build({
      items: [{ _id: ITEM, worldId: WORLD, compatibleChallengeTypeIds: [] }],
      exposedKeys: new Map([[ITEM.toString(), new Set(['bomb'])]]),
    });
    await service.noteExposed('acc-1', [ITEM.toString()]);
    expect(spend).not.toHaveBeenCalled();
  });

  it('forgets the summary when it cannot book the spend', async () => {
    // No summary yet, or counting down would go below zero. Either way the
    // stored number is not trustworthy and deriving it again is the repair.
    const { service, forget } = build({
      items: [itemPlayableInBoth],
      exposedKeys: new Map([
        [ITEM.toString(), new Set(['bomb', 'read-your-opponent'])],
      ]),
    });
    (
      service as unknown as { summaries: { spend: jest.Mock } }
    ).summaries.spend.mockResolvedValue(false);
    await service.noteExposed('acc-1', [ITEM.toString()]);
    expect(forget).toHaveBeenCalledWith('acc-1', WORLD.toString());
  });

  it('never lets a counter failure break the exposure that triggered it', async () => {
    const { service } = build({ items: [], exposedKeys: new Map() });
    (
      service as unknown as { items: { find: jest.Mock } }
    ).items.find.mockImplementation(() => {
      throw new Error('mongo is having a moment');
    });
    await expect(
      service.noteExposed('acc-1', [ITEM.toString()]),
    ).resolves.toBeUndefined();
  });
});

describe('deriving a World from scratch', () => {
  it('gives a new player the whole World', async () => {
    const { service, put } = build({
      items: [],
      exposedKeys: new Map(),
      totalReady: 310,
      seenItemIds: [],
    });
    await expect(service.rebuild('acc-new', WORLD.toString())).resolves.toBe(
      310,
    );
    expect(put).toHaveBeenCalledWith(
      'acc-new',
      expect.objectContaining({ remaining: 310, exhausted: 0 }),
    );
  });

  it('subtracts only the questions the player has used up entirely', async () => {
    const { service } = build({
      items: [{ _id: ITEM, compatibleChallengeTypeIds: [BOMB, RYO] }],
      exposedKeys: new Map([
        [ITEM.toString(), new Set(['bomb', 'read-your-opponent'])],
      ]),
      totalReady: 310,
      seenItemIds: [ITEM.toString()],
    });
    await expect(service.rebuild('acc-1', WORLD.toString())).resolves.toBe(309);
  });

  it('keeps owing a question the player has only half seen', async () => {
    const { service } = build({
      items: [{ _id: ITEM, compatibleChallengeTypeIds: [BOMB, RYO] }],
      exposedKeys: new Map([[ITEM.toString(), new Set(['bomb'])]]),
      totalReady: 310,
      seenItemIds: [ITEM.toString()],
    });
    await expect(service.rebuild('acc-1', WORLD.toString())).resolves.toBe(310);
  });
});

describe('serving the number to a screen', () => {
  it('uses a summary that is still trusted', async () => {
    const now = new Date('2026-11-23T00:00:00Z');
    const { service, put } = build({
      items: [],
      exposedKeys: new Map(),
      stored: [
        {
          worldId: WORLD.toString(),
          remaining: 287,
          totalReady: 310,
          exhausted: 23,
          rebuiltAt: new Date(now.getTime() - 60_000),
        },
      ],
    });
    const counts = await service.remainingFor('acc-1', [WORLD.toString()], now);
    expect(counts.get(WORLD.toString())).toBe(287);
    expect(put).not.toHaveBeenCalled();
  });

  it('derives again once a summary has aged out', async () => {
    // The catalogue grows through the admin panel, which never passes through
    // here, so an old summary is a stale one.
    const now = new Date('2026-11-23T00:00:00Z');
    const { service, put } = build({
      items: [],
      exposedKeys: new Map(),
      totalReady: 400,
      stored: [
        {
          worldId: WORLD.toString(),
          remaining: 287,
          totalReady: 310,
          exhausted: 23,
          rebuiltAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        },
      ],
    });
    const counts = await service.remainingFor('acc-1', [WORLD.toString()], now);
    expect(counts.get(WORLD.toString())).toBe(400);
    expect(put).toHaveBeenCalled();
  });
});
