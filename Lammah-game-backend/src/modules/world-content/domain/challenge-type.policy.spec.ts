import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
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
    expect(policy.validate(challengeType())).toEqual([]);
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

  it('rejects an unsupported item structure', () => {
    expect(
      codes(
        challengeType({
          itemStructure: 'endless' as unknown as ChallengeItemStructure,
        }),
      ),
    ).toContain('INVALID_ITEM_STRUCTURE');
  });

  it('requires a Signature mechanic to be exclusive', () => {
    expect(
      codes(
        challengeType({
          family: ChallengeFamily.SIGNATURE,
          isExclusive: false,
        }),
      ),
    ).toContain('SIGNATURE_MUST_BE_EXCLUSIVE');
  });

  it('refuses to let a shared family be marked exclusive', () => {
    expect(codes(challengeType({ isExclusive: true }))).toContain(
      'SHARED_FAMILY_MUST_NOT_BE_EXCLUSIVE',
    );
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
});
