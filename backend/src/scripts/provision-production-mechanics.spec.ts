import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
} from '../modules/world-content/domain/world-content.constants';
import { ChallengeTypePolicy } from '../modules/world-content/domain/challenge-type.policy';
import {
  PRODUCTION_MECHANICS,
  productionMechanicSystemFields,
} from '../modules/world-content/domain/production-mechanic.definition';
import {
  canonicalProvisionedDocument,
  ProductionMechanicProvisioner,
} from './provision-production-mechanics';
import { ChallengePresentationPolicy } from '../modules/world-content/domain/challenge-presentation.policy';
import { ScoringRuleRegistry } from '../modules/scoring/application/scoring-rule.registry';

describe('production mechanic provisioning', () => {
  const policy = new ChallengeTypePolicy(
    new ChallengePresentationPolicy(),
    new ScoringRuleRegistry(),
  );

  it.each(PRODUCTION_MECHANICS.map((entry) => [entry.slug, entry] as const))(
    'provisions %s with its runtime identity and generic Match rule',
    (_slug, definition) => {
      const created = canonicalProvisionedDocument(definition);
      expect(created).toMatchObject(productionMechanicSystemFields(definition));
      expect(created.scoringRuleId).toBe(SCORING_RULE_IDS.CHALLENGE_WIN);
      expect(policy.validate({ ...created, id: 'new' } as never)).toEqual([]);
      expect(policy.warnings({ ...created, id: 'new' } as never)).toEqual([]);
    },
  );

  it('repairs stale system metadata without replacing the document or admin fields', () => {
    const definition = PRODUCTION_MECHANICS.find(
      (entry) => entry.slug === 'closest',
    )!;
    const existing = {
      ...definition.seed,
      _id: 'stable-id',
      name: 'اسم إداري',
      status: 'active',
      scoringRuleId: 'coop.item-success',
    };
    const repaired = canonicalProvisionedDocument(definition, existing);
    expect(repaired._id).toBe('stable-id');
    expect(repaired.name).toBe('اسم إداري');
    expect(repaired.status).toBe('active');
    expect(repaired.scoringRuleId).toBe(SCORING_RULE_IDS.CHALLENGE_WIN);
    const rerun = canonicalProvisionedDocument(definition, repaired);
    expect(rerun._id).toBe('stable-id');
    expect({ ...rerun, updatedAt: undefined }).toMatchObject({
      ...repaired,
      ...productionMechanicSystemFields(definition),
      updatedAt: undefined,
    });
  });

  it('does not recreate production mechanics intentionally deleted by an admin', async () => {
    const insertOne = jest.fn();
    const db = {
      collection: jest.fn((name: string) =>
        name === 'challenge_types'
          ? { findOne: jest.fn().mockResolvedValue(null), insertOne }
          : {
              findOne: jest.fn(({ slug }: { slug: string }) =>
                Promise.resolve({
                  slug,
                  state: 'deleted_by_admin',
                  challengeTypeId: `deleted-${slug}`,
                }),
              ),
            },
      ),
    };
    const report = await new ProductionMechanicProvisioner(
      db as never,
      true,
    ).run();
    expect(report.entries).toHaveLength(PRODUCTION_MECHANICS.length);
    expect(report.entries).toEqual(
      expect.arrayContaining(
        PRODUCTION_MECHANICS.map((definition) =>
          expect.objectContaining({
            slug: definition.slug,
            outcome: 'intentionally-deleted',
          }),
        ),
      ),
    );
    expect(insertOne).not.toHaveBeenCalled();
  });
});

describe('scoped provisioning', () => {
  const dbWith = (challengeTypes: Record<string, unknown>[]) => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'new-id' });
    const updateOne = jest.fn();
    return {
      insertOne,
      updateOne,
      db: {
        collection: jest.fn((name: string) =>
          name === 'challenge_types'
            ? {
                findOne: jest.fn(({ slug }: { slug: string }) =>
                  Promise.resolve(
                    challengeTypes.find((entry) => entry.slug === slug) ?? null,
                  ),
                ),
                insertOne,
                updateOne,
              }
            : { findOne: jest.fn().mockResolvedValue(null) },
        ),
      } as never,
    };
  };

  it('touches only the requested mechanic, leaving other missing ones alone', async () => {
    // A single-mechanic rollout must not become a catalog-wide change: every
    // other production mechanic absent from this database stays absent.
    const { db, insertOne } = dbWith([]);
    const report = await new ProductionMechanicProvisioner(db, true, [
      'combo',
    ]).run();

    expect(report.only).toEqual(['combo']);
    expect(report.entries.map((entry) => entry.slug)).toEqual(['combo']);
    expect(insertOne).toHaveBeenCalledTimes(1);
    expect(insertOne.mock.calls[0][0]).toMatchObject({ slug: 'combo' });
  });

  it('is idempotent — a second scoped run reports unchanged and writes nothing', async () => {
    const definition = PRODUCTION_MECHANICS.find(
      (entry) => entry.slug === 'combo',
    )!;
    const { db, insertOne, updateOne } = dbWith([
      { _id: 'combo-id', ...canonicalProvisionedDocument(definition) },
    ]);
    const report = await new ProductionMechanicProvisioner(db, true, [
      'combo',
    ]).run();

    expect(report.entries).toEqual([
      {
        slug: 'combo',
        outcome: 'unchanged',
        id: 'combo-id',
        changedFields: [],
      },
    ]);
    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('still sweeps every mechanic when no scope is given', async () => {
    const { db } = dbWith([]);
    const report = await new ProductionMechanicProvisioner(db, false).run();
    expect(report.only).toBeUndefined();
    expect(report.entries).toHaveLength(PRODUCTION_MECHANICS.length);
  });

  it('refuses a slug that is not a production mechanic', () => {
    const { db } = dbWith([]);
    expect(
      () => new ProductionMechanicProvisioner(db, true, ['combbo']),
    ).toThrow(/Not a production mechanic slug: combbo/);
  });
});

describe('canonical Bomb identity', () => {
  const bomb = () =>
    PRODUCTION_MECHANICS.find((entry) => entry.slug === 'bomb')!;

  it('is a Shared Core mechanic, not a Signature', () => {
    // §16.1: Bomb replaces One Clue in the Shared Core. Signature would claim an
    // exclusivity Bomb must not have — a Signature belongs to exactly one World,
    // and Bomb is meant to be configurable on many boards.
    expect(bomb().family).not.toBe(ChallengeFamily.SIGNATURE);
    expect(bomb().family).toBe(ChallengeFamily.COOP);
  });

  it('grades typed text, matching the runtime plugin', () => {
    expect(bomb().answerMode).toBe(ChallengeAnswerMode.MATCH);
  });

  it('declares no per-item timer, because the clock is the team clock', () => {
    // Bomb's deadline comes from the session clock, so a per-item timer here
    // would be a second, contradicting source of pacing.
    expect(bomb().seed.defaultPresentation.timerSeconds).toBeNull();
  });

  it('occupies a slot as one continuous unit', () => {
    expect(bomb().itemStructure).toBe(ChallengeItemStructure.CONTINUOUS);
  });

  it('is named for players in Arabic', () => {
    expect(bomb().seed.name).toBe('القنبلة');
  });
});
