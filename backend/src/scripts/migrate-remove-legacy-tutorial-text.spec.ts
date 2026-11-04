import { LegacyTutorialTextCleanup } from './migrate-remove-legacy-tutorial-text';

function collection(initial: Record<string, unknown>[]) {
  const rows = initial.map((row) => ({ ...row }));
  const has = (row: Record<string, unknown>, path: string) => {
    const parts = path.split('.');
    let value: unknown = row;
    for (const part of parts) {
      if (!value || typeof value !== 'object') return false;
      value = (value as Record<string, unknown>)[part];
    }
    return value !== undefined;
  };
  const unset = (row: Record<string, unknown>, path: string) => {
    const parts = path.split('.');
    const last = parts.pop()!;
    let parent = row;
    for (const part of parts) {
      const next = parent[part];
      if (!next || typeof next !== 'object') return;
      parent = next as Record<string, unknown>;
    }
    delete parent[last];
  };
  return {
    countDocuments: jest.fn(async (filter: Record<string, unknown>) => {
      const path = Object.keys(filter)[0];
      return rows.filter((row) => has(row, path)).length;
    }),
    updateMany: jest.fn(async (filter: Record<string, unknown>) => {
      const path = Object.keys(filter)[0];
      let modifiedCount = 0;
      for (const row of rows) {
        if (!has(row, path)) continue;
        unset(row, path);
        modifiedCount += 1;
      }
      return { modifiedCount };
    }),
  };
}

describe('legacy tutorial text cleanup', () => {
  it('dry-runs without mutating GSAP or legacy records', async () => {
    const challengeTypes = collection([
      { defaultPresentation: { playerInstructions: { summary: 'قديم' } } },
    ]);
    const configurations = collection([{ instructions: 'تعليمات قديمة' }]);
    const db = {
      collection: jest.fn((name: string) =>
        name === 'challenge_types' ? challengeTypes : configurations,
      ),
    } as never;

    const report = await new LegacyTutorialTextCleanup(
      db,
      false,
      'mongodb://localhost/fixture',
    ).run();

    expect(report.mode).toBe('DRY RUN');
    expect(report.targets.map((target) => target.matchedDocuments)).toEqual([
      1, 1,
    ]);
    expect(challengeTypes.updateMany).not.toHaveBeenCalled();
    expect(configurations.updateMany).not.toHaveBeenCalled();
  });

  it('removes only the verified text fields in apply mode', async () => {
    const challengeTypes = collection([
      {
        defaultPresentation: { playerInstructions: { summary: 'قديم' } },
        tutorial: { publishedRevision: 4 },
      },
    ]);
    const configurations = collection([
      { instructions: 'تعليمات قديمة', displayName: 'اسم العالم' },
    ]);
    const db = {
      collection: jest.fn((name: string) =>
        name === 'challenge_types' ? challengeTypes : configurations,
      ),
    } as never;

    const report = await new LegacyTutorialTextCleanup(
      db,
      true,
      'mongodb://localhost/fixture',
    ).run();

    expect(report.targets.map((target) => target.remainingDocuments)).toEqual([
      0, 0,
    ]);
    expect(challengeTypes.updateMany).toHaveBeenCalledTimes(1);
    expect(configurations.updateMany).toHaveBeenCalledTimes(1);
    expect(report.gsapCollectionsUntouched).toEqual([
      'challenge_types.tutorial',
      'scoped_mechanic_tutorials',
    ]);
  });
});
