import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContentItemStatus } from '../domain/world-content.constants';
import { WorldContentConflictError } from '../domain/world-content.errors';
import { WorldSlotMechanicRemovalService } from './world-slot-mechanic-removal.service';

/**
 * Releasing one mechanic from one board position of one World.
 *
 * The two rules under test are the scope of the blast radius — World + slot +
 * ChallengeType, never the global mechanic and never another World — and the
 * atomicity of the two destructive writes.
 */
describe('WorldSlotMechanicRemovalService', () => {
  const WORLD = new Types.ObjectId().toHexString();
  const COMBO = new Types.ObjectId().toHexString();
  const ONE_CLUE = new Types.ObjectId().toHexString();
  const CONFIG = new Types.ObjectId().toHexString();

  const item = (compatible: string[], status = ContentItemStatus.READY) => ({
    _id: new Types.ObjectId(),
    status,
    compatibleChallengeTypeIds: compatible.map(
      (id) => new Types.ObjectId(id) as unknown,
    ),
  });

  const build = (options: {
    boundChallengeTypeId?: string;
    items?: ReturnType<typeof item>[];
    boardReady?: boolean;
    releaseSucceeds?: boolean;
  }) => {
    const items = options.items ?? [];
    const withTransaction = jest.fn(async (work: () => Promise<void>) => {
      await work();
    });
    const endSession = jest.fn();
    const configurations = {
      findById: jest.fn().mockResolvedValue({
        _id: CONFIG,
        worldId: WORLD,
        challengeTypeId: options.boundChallengeTypeId ?? COMBO,
        slotKey: 'slot_2',
      }),
      deleteByIdInSession: jest
        .fn()
        .mockResolvedValue(options.releaseSucceeds ?? true),
      deleteByChallengeType: jest.fn(),
    };
    const contentItems = {
      listForWorldMechanic: jest.fn().mockResolvedValue(items),
      deleteByIds: jest.fn((...args: unknown[]) =>
        Promise.resolve((args[0] as string[]).length),
      ),
      detachChallengeType: jest.fn((...args: unknown[]) =>
        Promise.resolve((args[0] as string[]).length),
      ),
      deleteByChallengeType: jest.fn(),
    };
    const challengeTypes = {
      findById: jest
        .fn()
        .mockResolvedValue({ _id: COMBO, slug: 'combo', name: 'الكومبو' }),
      deleteById: jest.fn(),
    };
    const worlds = {
      findById: jest.fn().mockResolvedValue({ _id: WORLD, name: 'انمي' }),
    };
    const readiness = {
      evaluateWorld: jest
        .fn()
        .mockResolvedValue({ boardReady: options.boardReady ?? false }),
      assertChangeKeepsActiveWorldValid: jest.fn(),
    };
    const service = new WorldSlotMechanicRemovalService(
      {
        startSession: jest
          .fn()
          .mockResolvedValue({ withTransaction, endSession }),
      } as never,
      configurations as never,
      contentItems as never,
      challengeTypes as never,
      worlds as never,
      readiness as never,
    );
    return {
      service,
      configurations,
      contentItems,
      challengeTypes,
      readiness,
      withTransaction,
      endSession,
    };
  };

  describe('preview', () => {
    it('counts only this World and this mechanic', async () => {
      const { service, contentItems } = build({
        items: [
          item([COMBO]),
          item([COMBO]),
          item([COMBO], ContentItemStatus.DRAFT),
        ],
      });

      const preview = await service.preview(CONFIG);

      // Scoped by World *and* mechanic: the query the count comes from cannot
      // see another World's items for the same mechanic.
      expect(contentItems.listForWorldMechanic).toHaveBeenCalledWith(
        WORLD,
        COMBO,
      );
      expect(preview.content).toEqual({
        total: 3,
        ready: 2,
        exclusive: 3,
        shared: 0,
      });
      expect(preview.boardWillBecomeIncomplete).toBe(true);
      expect(preview.challengeTypeName).toBe('الكومبو');
      expect(preview.worldName).toBe('انمي');
      expect(preview.slotKey).toBe('slot_2');
    });

    it('separates items another mechanic can still play', async () => {
      const { service } = build({
        items: [item([COMBO]), item([COMBO, ONE_CLUE])],
      });
      const preview = await service.preview(CONFIG);
      expect(preview.content).toMatchObject({
        total: 2,
        exclusive: 1,
        shared: 1,
      });
    });

    it('reports zero for a mechanic with no content in this World', async () => {
      const { service } = build({ items: [] });
      const preview = await service.preview(CONFIG);
      expect(preview.content).toEqual({
        total: 0,
        ready: 0,
        exclusive: 0,
        shared: 0,
      });
    });

    it('writes nothing', async () => {
      const { service, contentItems, configurations } = build({
        items: [item([COMBO])],
      });
      await service.preview(CONFIG);
      expect(contentItems.deleteByIds).not.toHaveBeenCalled();
      expect(contentItems.detachChallengeType).not.toHaveBeenCalled();
      expect(configurations.deleteByIdInSession).not.toHaveBeenCalled();
    });

    it('404s on a configuration that does not exist', async () => {
      const { service, configurations } = build({});
      configurations.findById.mockResolvedValue(null);
      await expect(service.preview(CONFIG)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes exactly the exclusive items and releases the slot', async () => {
      const { service, contentItems, configurations } = build({
        items: [item([COMBO]), item([COMBO]), item([COMBO])],
      });

      const result = await service.remove(CONFIG, {
        expectedChallengeTypeId: COMBO,
      });

      expect(contentItems.deleteByIds.mock.calls[0][0]).toHaveLength(3);
      expect(contentItems.detachChallengeType.mock.calls[0][0]).toEqual([]);
      expect(configurations.deleteByIdInSession).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        deletedContentItems: 3,
        detachedSharedItems: 0,
        slotNowEmpty: true,
        boardReady: false,
      });
    });

    it('releases a slot with no content at all', async () => {
      const { service, configurations } = build({ items: [] });

      const result = await service.remove(CONFIG, {
        expectedChallengeTypeId: COMBO,
      });

      expect(result).toMatchObject({
        deletedContentItems: 0,
        detachedSharedItems: 0,
        slotNowEmpty: true,
      });
      expect(configurations.deleteByIdInSession).toHaveBeenCalledTimes(1);
    });

    it('detaches shared items instead of destroying another mechanic content', async () => {
      const shared = item([COMBO, ONE_CLUE]);
      const exclusive = item([COMBO]);
      const { service, contentItems } = build({ items: [shared, exclusive] });

      const result = await service.remove(CONFIG, {
        expectedChallengeTypeId: COMBO,
      });

      expect(contentItems.deleteByIds.mock.calls[0][0]).toEqual([
        String(exclusive._id),
      ]);
      expect(contentItems.detachChallengeType).toHaveBeenCalledWith(
        [String(shared._id)],
        COMBO,
        expect.anything(),
      );
      expect(result).toMatchObject({
        deletedContentItems: 1,
        detachedSharedItems: 1,
      });
    });

    it('never touches the global ChallengeType or any other World binding', async () => {
      const { service, challengeTypes, configurations, contentItems } = build({
        items: [item([COMBO])],
      });

      await service.remove(CONFIG, { expectedChallengeTypeId: COMBO });

      expect(challengeTypes.deleteById).not.toHaveBeenCalled();
      // The blunt catalog-wide helpers exist on these repositories; this
      // operation must never reach for them.
      expect(configurations.deleteByChallengeType).not.toHaveBeenCalled();
      expect(contentItems.deleteByChallengeType).not.toHaveBeenCalled();
      // Exactly one binding removed, identified by id rather than by mechanic.
      expect(configurations.deleteByIdInSession).toHaveBeenCalledWith(
        CONFIG,
        expect.anything(),
      );
    });

    it('refuses a confirmation for a mechanic the slot no longer holds', async () => {
      // The operator confirmed removing الكومبو; the slot now holds one-clue.
      const { service, contentItems, configurations } = build({
        boundChallengeTypeId: ONE_CLUE,
        items: [item([ONE_CLUE])],
      });

      const error = await service
        .remove(CONFIG, { expectedChallengeTypeId: COMBO })
        .catch((cause: WorldContentConflictError) => cause);
      expect(error).toBeInstanceOf(WorldContentConflictError);
      expect((error as WorldContentConflictError).getResponse()).toMatchObject({
        code: 'BOARD_SLOT_REBOUND',
      });

      expect(contentItems.deleteByIds).not.toHaveBeenCalled();
      expect(configurations.deleteByIdInSession).not.toHaveBeenCalled();
    });

    it('does both destructive writes inside one transaction', async () => {
      const { service, withTransaction, contentItems, configurations } = build({
        items: [item([COMBO])],
      });

      await service.remove(CONFIG, { expectedChallengeTypeId: COMBO });

      expect(withTransaction).toHaveBeenCalledTimes(1);
      // Both writes received the transaction's session, so neither can commit
      // without the other.
      const session = contentItems.deleteByIds.mock.calls[0][1];
      expect(session).toBeDefined();
      expect(configurations.deleteByIdInSession.mock.calls[0][1]).toBe(session);
    });

    it('aborts rather than orphaning content when the binding vanished', async () => {
      const { service, withTransaction, endSession } = build({
        items: [item([COMBO])],
        releaseSucceeds: false,
      });

      await expect(
        service.remove(CONFIG, { expectedChallengeTypeId: COMBO }),
      ).rejects.toBeInstanceOf(WorldContentConflictError);

      // The throw happens inside the transaction, so the content deletions roll
      // back with it — no "content gone, slot still bound" state.
      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(endSession).toHaveBeenCalled();
    });

    it('reports the board state the policy actually returns, not a guess', async () => {
      const { service, readiness } = build({ items: [], boardReady: true });
      const result = await service.remove(CONFIG, {
        expectedChallengeTypeId: COMBO,
      });
      expect(readiness.evaluateWorld).toHaveBeenCalledWith(WORLD);
      expect(result.boardReady).toBe(true);
    });
  });
});
