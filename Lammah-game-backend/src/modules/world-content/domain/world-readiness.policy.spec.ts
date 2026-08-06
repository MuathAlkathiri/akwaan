import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { BoardDefinitionPolicy } from './board-definition.policy';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import { ScopeCompatibilityPolicy } from './scope-compatibility.policy';
import { WorldContentStatus } from './world-content.constants';
import { scope, validBoard } from './world-content.fixtures';
import { WorldReadinessPolicy } from './world-readiness.policy';

describe('WorldReadinessPolicy', () => {
  const policy = new WorldReadinessPolicy(
    new BoardDefinitionPolicy(
      new ChallengeTypePolicy(
        new ChallengePresentationPolicy(),
        new ScoringRuleRegistry(),
      ),
    ),
    new ScopeCompatibilityPolicy(),
  );

  const input = (overrides = {}) => ({
    ...validBoard(),
    scopes: [scope()],
    ...overrides,
  });

  it('activates a World with a complete board and one active Scope', () => {
    const report = policy.evaluate(input());
    expect(report.blockers).toEqual([]);
    expect(report.boardReady).toBe(true);
    expect(report.hasRelationalChallenge).toBe(true);
    expect(policy.canActivate(input())).toBe(true);
  });

  it('refuses a World with no active Scope', () => {
    const report = policy.evaluate(
      input({ scopes: [scope({ status: WorldContentStatus.DRAFT })] }),
    );
    expect(report.blockers.map((problem) => problem.code)).toContain(
      'WORLD_WITHOUT_ACTIVE_SCOPE',
    );
  });

  it('blocks activation when an active Scope leaves fewer than four usable challenges', () => {
    const report = policy.evaluate(
      input({
        scopes: [scope({ excludedChallengeTypeIds: ['challenge-relational'] })],
      }),
    );
    expect(report.blockers.map((problem) => problem.code)).toContain(
      'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
    );
  });

  it('only warns when the offending Scope is not active yet', () => {
    const report = policy.evaluate(
      input({
        scopes: [
          scope(),
          scope({
            id: 'scope-draft',
            slug: 'draft-scope',
            status: WorldContentStatus.DRAFT,
            excludedChallengeTypeIds: ['challenge-relational'],
          }),
        ],
      }),
    );
    expect(report.blockers).toEqual([]);
    expect(report.warnings.map((problem) => problem.code)).toContain(
      'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
    );
  });

  it('warns about challenges that have no ready content yet', () => {
    const report = policy.evaluate(
      input({
        readyContentCountByChallengeType: new Map([['challenge-ryo', 3]]),
      }),
    );
    const warnings = report.warnings.filter(
      (problem) => problem.code === 'CHALLENGE_WITHOUT_READY_CONTENT',
    );
    expect(warnings).toHaveLength(3);
    expect(report.readiness).toBe('limited');
    expect(report.blockers).toEqual([]);
  });
});
