import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';
import { ChallengeTypePolicy } from '../modules/world-content/domain/challenge-type.policy';
import {
  PRODUCTION_MECHANICS,
  productionMechanicSystemFields,
} from '../modules/world-content/domain/production-mechanic.definition';
import { canonicalProvisionedDocument } from './provision-production-mechanics';
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
});
