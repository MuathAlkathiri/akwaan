import { Types } from 'mongoose';
import {
  buildMigrationPlan,
  genericSlotFor,
} from './migrate-generic-world-board-slots';

describe('generic World board slot migration', () => {
  const configuration = (worldId: Types.ObjectId, slotKey: string) => ({
    _id: new Types.ObjectId(),
    worldId,
    slotKey,
    slotType: slotKey,
  });

  it.each([
    ['signature', 'slot_1'],
    ['ryo_1', 'slot_2'],
    ['ryo_2', 'slot_3'],
    ['flex', 'slot_4'],
  ])('maps %s to %s without touching mechanic data', (source, target) => {
    expect(genericSlotFor(source)).toBe(target);
  });

  it('plans only slot identifier changes', () => {
    const worldId = new Types.ObjectId();
    const plan = buildMigrationPlan([
      configuration(worldId, 'signature'),
      configuration(worldId, 'ryo_1'),
      configuration(worldId, 'ryo_2'),
      configuration(worldId, 'flex'),
    ]);
    expect(plan.updates.map((entry) => entry.slotKey)).toEqual([
      'slot_1',
      'slot_2',
      'slot_3',
      'slot_4',
    ]);
    expect(plan.skippedWorlds).toEqual([]);
  });

  it('stops a World safely when a target slot already exists', () => {
    const worldId = new Types.ObjectId();
    const plan = buildMigrationPlan([
      configuration(worldId, 'signature'),
      configuration(worldId, 'slot_1'),
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.skippedWorlds).toHaveLength(1);
  });
});
