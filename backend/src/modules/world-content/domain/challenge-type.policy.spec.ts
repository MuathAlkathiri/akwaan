import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import {
  ANSWER_MODE_COMPATIBLE_ITEM_MODES,
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  MARHALA_SLUG,
} from './world-content.constants';
import { challengeType, presentation } from './world-content.fixtures';
import {
  ChallengePresentation,
  normalizePresentation,
} from './world-content.types';

describe('ChallengeTypePolicy', () => {
  const policy = new ChallengeTypePolicy(
    new ChallengePresentationPolicy(),
    new ScoringRuleRegistry(),
  );

  const codes = (challenge: Parameters<typeof policy.validate>[0]) =>
    policy.validate(challenge).map((problem) => problem.code);

  it('accepts a coherent shared mechanic', () => {
    expect(
      policy.validate(
        challengeType({ scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN }),
      ),
    ).toEqual([]);
  });

  it('rejects an unsupported family', () => {
    expect(
      codes(challengeType({ family: 'buzzer' as unknown as ChallengeFamily })),
    ).toContain('INVALID_CHALLENGE_FAMILY');
  });

  it('rejects an unsupported answer mode', () => {
    expect(
      codes(
        challengeType({
          answerMode: 'freetext' as unknown as ChallengeAnswerMode,
        }),
      ),
    ).toContain('INVALID_ANSWER_MODE');
  });

  it('rejects an answer mode its family cannot resolve automatically', () => {
    expect(
      codes(
        challengeType({
          family: ChallengeFamily.RYO,
          answerMode: ChallengeAnswerMode.SPLIT,
        }),
      ),
    ).toContain('ANSWER_MODE_NOT_ALLOWED_FOR_FAMILY');
  });

  it('binds the One Clue wrapper mode to its canonical runtime slug', () => {
    expect(
      ANSWER_MODE_COMPATIBLE_ITEM_MODES[ChallengeAnswerMode.ONE_CLUE],
    ).toEqual([ChallengeAnswerMode.MATCH]);
    expect(
      policy.validate(
        challengeType({
          slug: 'one-clue',
          family: ChallengeFamily.COOP,
          answerMode: ChallengeAnswerMode.ONE_CLUE,
          scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
        }),
      ),
    ).toEqual([]);
    expect(
      codes(
        challengeType({
          slug: 'one-clue',
          family: ChallengeFamily.COOP,
          answerMode: ChallengeAnswerMode.CLOSEST,
        }),
      ),
    ).toContain('PRODUCTION_MECHANIC_CONFIGURATION_DRIFT');
  });

  it('keeps One Clue ready only through its implemented Match scoring rule', () => {
    const oneClue = challengeType({
      slug: 'one-clue',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.ONE_CLUE,
      scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
    });
    expect(policy.validate(oneClue)).toEqual([]);
    expect(policy.warnings(oneClue)).toEqual([]);
    expect(
      codes({ ...oneClue, scoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS }),
    ).toContain('PRODUCTION_MECHANIC_CONFIGURATION_DRIFT');
  });

  it('rejects an unsupported item structure', () => {
    expect(
      codes(
        challengeType({
          itemStructure: 'endless' as unknown as ChallengeItemStructure,
        }),
      ),
    ).toContain('INVALID_ITEM_STRUCTURE');
  });

  it('blocks activation without a scoring rule', () => {
    expect(codes(challengeType({ scoringRuleId: '' }))).toContain(
      'SCORING_RULE_REQUIRED',
    );
  });

  it('blocks activation when the scoring rule is not registered', () => {
    expect(
      codes(challengeType({ scoringRuleId: 'ryo.invented-by-hand' })),
    ).toContain('SCORING_RULE_NOT_REGISTERED');
  });

  it('rejects malformed presentation configuration', () => {
    const problems = codes(
      challengeType({
        defaultPresentation: presentation({
          inputType: 'Phone Multiple Choice',
          timerSeconds: 0,
        }),
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'INVALID_PRESENTATION_INPUT_TYPE',
        'INVALID_PRESENTATION_TIMER',
      ]),
    );
  });

  it('reports a record with no presentation as invalid instead of throwing', () => {
    // A challenge type written before this schema existed, or left behind by a
    // partial migration, must surface as a readiness blocker — never crash the
    // listing that loads it.
    const legacy = {
      ...challengeType(),
      defaultPresentation: undefined as unknown as ChallengePresentation,
    };
    expect(codes(legacy)).toContain('INVALID_PRESENTATION_INPUT_TYPE');
    expect(normalizePresentation(undefined)).toEqual({
      inputType: '',
      timerSeconds: null,
      soundPack: null,
      revealStyle: null,
      playerInstructions: null,
    });
  });

  it('warns that a declared rule has no calculator bound yet', () => {
    const warnings = policy
      .warnings(
        challengeType({ scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX }),
      )
      .map((problem) => problem.code);
    expect(warnings).toContain('SCORING_RULE_AWAITING_MECHANIC');
  });

  describe('"awaiting mechanic" derives from actual calculator binding', () => {
    const warnCodes = (
      p: ChallengeTypePolicy,
      ct: Parameters<typeof p.warnings>[0],
    ) => p.warnings(ct).map((problem) => problem.code);

    it('keeps warning while a mechanic-binding rule has no calculator (truly not programmed)', () => {
      // A fresh registry binds nothing; a rule that declares it needs a
      // mechanic-bound calculator is genuinely awaiting one.
      const bare = new ChallengeTypePolicy(
        new ChallengePresentationPolicy(),
        new ScoringRuleRegistry(),
      );
      expect(
        warnCodes(
          bare,
          challengeType({ scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX }),
        ),
      ).toContain('SCORING_RULE_AWAITING_MECHANIC');
    });

    it('stops calling it "not programmed" once the mechanic ships and binds a calculator', () => {
      const registry = new ScoringRuleRegistry();
      registry.bind({
        ruleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        calculate: () => [],
      });
      const withMechanic = new ChallengeTypePolicy(
        new ChallengePresentationPolicy(),
        registry,
      );
      expect(
        warnCodes(
          withMechanic,
          challengeType({ scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX }),
        ),
      ).not.toContain('SCORING_RULE_AWAITING_MECHANIC');
    });

    it('never labels an implemented Match-scored mechanic (المرحلة/Marhala) "not programmed"', () => {
      // The canonical scoring rule for a Match-scored mechanic is CHALLENGE_WIN,
      // which needs no mechanic binding. Marhala is implemented and uses it, so it
      // must read as ready — never "awaiting mechanic".
      const marhala = challengeType({
        slug: 'marhala',
        family: ChallengeFamily.SIGNATURE,
        scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
      });
      // The readiness warning is what mislabels a mechanic "not programmed"; with
      // the Match-scoring rule and its complete instructions, Marhala raises none.
      expect(policy.warnings(marhala)).toEqual([]);
      expect(warnCodes(policy, marhala)).not.toContain(
        'SCORING_RULE_AWAITING_MECHANIC',
      );
    });

    it('reports a missing-metadata gap without implying the mechanic is unprogrammed', () => {
      const missingInstructions = challengeType({
        scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
        defaultPresentation: presentation({ playerInstructions: null }),
      });
      const problems = warnCodes(policy, missingInstructions);
      expect(problems).toContain('CHALLENGE_TYPE_PLAYER_INSTRUCTIONS_MISSING');
      expect(problems).not.toContain('SCORING_RULE_AWAITING_MECHANIC');
    });
  });

  describe('Marhala canonical scoring rule holds the drift guard', () => {
    // The canonical Video Games Signature (§17.7): challenge.win is the only
    // scoring rule its runtime definition accepts. The guard must welcome that
    // rule and reject every other, which is exactly what makes the Admin catalog
    // fix necessary — the author has to be able to pick challenge.win.
    const marhalaCanonical = challengeType({
      slug: MARHALA_SLUG,
      family: ChallengeFamily.SIGNATURE,
      itemStructure: ChallengeItemStructure.CONTINUOUS,
      answerMode: ChallengeAnswerMode.MATCH,
      scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
    });

    it('D. accepts Marhala configured with challenge.win', () => {
      expect(codes(marhalaCanonical)).not.toContain(
        'PRODUCTION_MECHANIC_CONFIGURATION_DRIFT',
      );
    });

    it('E. rejects Marhala configured with top-5.result', () => {
      expect(
        codes({
          ...marhalaCanonical,
          scoringRuleId: SCORING_RULE_IDS.TOP5_RESULT,
        }),
      ).toContain('PRODUCTION_MECHANIC_CONFIGURATION_DRIFT');
    });

    it('F. rejects Marhala configured with signature.declared-by-mechanic', () => {
      expect(
        codes({
          ...marhalaCanonical,
          scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
        }),
      ).toContain('PRODUCTION_MECHANIC_CONFIGURATION_DRIFT');
    });
  });
});
