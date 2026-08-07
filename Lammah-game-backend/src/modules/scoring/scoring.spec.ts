import {
  PERFECT_CLEAR_BONUS_POINTS,
  PerfectClearBonusRule,
} from './application/perfect-clear-bonus.rule';
import { ScoringRuleRegistry } from './application/scoring-rule.registry';
import { ScoringService } from './application/scoring.service';
import { RyoPayoffMatrixRule } from './application/ryo-payoff-matrix.rule';
import { Top5ResultRule } from './application/top5-result.rule';
import { ScoreLedger } from './domain/score-ledger';
import {
  clampScoreForDisplay,
  isScoreEvent,
  ScoreEvent,
} from './domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringContext,
  ScoringRuleCalculator,
  ScoringRuleId,
} from './domain/scoring-rule';
import {
  ForeignScoreEventError,
  ScoringRuleContractError,
  ScoringRuleNotImplementedError,
  ScoringRuleNotRegisteredError,
} from './domain/scoring.errors';

describe('Scoring foundation (roadmap 8, 16)', () => {
  const context: ScoringContext = {
    matchId: 'match-1',
    challengeSessionId: 'challenge-1',
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let registry: ScoringRuleRegistry;
  let scoring: ScoringService;

  beforeEach(() => {
    registry = new ScoringRuleRegistry();
    registry.bind(new PerfectClearBonusRule(registry));
    registry.bind(new RyoPayoffMatrixRule());
    registry.bind(new Top5ResultRule());
    scoring = new ScoringService(registry);
  });

  describe('registry', () => {
    it('resolves every declared rule', () => {
      for (const ruleId of Object.values(SCORING_RULE_IDS)) {
        expect(registry.isRegistered(ruleId)).toBe(true);
        expect(registry.declaration(ruleId).id).toBe(ruleId);
      }
    });

    it('rejects an unregistered rule', () => {
      expect(registry.isRegistered('ryo.made-up')).toBe(false);
      expect(() => registry.declaration('ryo.made-up')).toThrow(
        ScoringRuleNotRegisteredError,
      );
    });

    it('reports a declared future rule that has no calculator yet', () => {
      expect(() =>
        registry.calculator(SCORING_RULE_IDS.COOP_ITEM_SUCCESS),
      ).toThrow(ScoringRuleNotImplementedError);
    });

    it('refuses to bind a calculator for an undeclared rule', () => {
      const rogue = {
        ruleId: 'ryo.rogue',
        calculate: () => [],
      } as unknown as ScoringRuleCalculator;
      expect(() => registry.bind(rogue)).toThrow(ScoringRuleNotRegisteredError);
    });
  });

  describe('RYO payoff matrix', () => {
    const base = {
      answeringTeamId: 'team-a',
      opposingTeamId: 'team-b',
      contentItemId: 'item-1',
      itemIndex: 0,
      selectedAnswer: 'option-a',
      correctAnswer: 'option-a',
    };

    it.each([
      ['TRUST', true, 'team-a', 1, 'ryo.trust.correct'],
      ['TRUST', false, 'team-b', 1, 'ryo.trust.wrong'],
      ['STEAL', true, 'team-b', 1, 'ryo.steal.correct'],
      ['STEAL', false, 'team-b', -1, 'ryo.steal.failed'],
    ] as const)(
      '%s + correct=%s scores the exact signed payoff',
      (decision, correct, teamId, delta, reason) => {
        const [event] = scoring.score(
          SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
          { ...base, decision, correct },
          context,
        );
        expect(event).toMatchObject({ teamId, delta, reason });
        expect(event.metadata).toMatchObject({
          answeringTeamId: 'team-a',
          opposingTeamId: 'team-b',
          opponentDecision: decision,
        });
      },
    );
  });

  describe('perfect clear bonus', () => {
    const score = (
      input: Parameters<PerfectClearBonusRule['calculate']>[0],
    ): ScoreEvent[] =>
      scoring.score(
        SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS,
        input,
        context,
      );

    it('awards a point for clearing every item of an eligible challenge', () => {
      const [event] = score({
        teamId: 'team-a',
        challengeScoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
        clearedItemCount: 3,
        totalItemCount: 3,
      });
      expect(event.delta).toBe(PERFECT_CLEAR_BONUS_POINTS);
      expect(event.scoringRuleId).toBe(
        SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS,
      );
      expect(event.createdAt).toEqual(context.occurredAt);
    });

    it('does not award the bonus to an RYO challenge', () => {
      // Roadmap 8: RYO opts out through its declaration, not a special case.
      expect(
        score({
          teamId: 'team-a',
          challengeScoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
          clearedItemCount: 3,
          totalItemCount: 3,
        }),
      ).toEqual([]);
    });

    it('does not award the bonus for a partial clear', () => {
      expect(
        score({
          teamId: 'team-a',
          challengeScoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
          clearedItemCount: 2,
          totalItemCount: 3,
        }),
      ).toEqual([]);
    });
  });

  describe('Top 5 result', () => {
    it('awards exactly one Match point to the team owning more of the real five', () => {
      const [event] = scoring.score(
        SCORING_RULE_IDS.TOP5_RESULT,
        {
          teamIds: ['team-a', 'team-b'],
          top5Counts: { 'team-a': 3, 'team-b': 2 },
          trapCounts: { 'team-a': 1, 'team-b': 4 },
          contentItemId: 'item-1',
          startingTeamId: 'team-b',
          ownership: [{ entryId: 'entry-1' }],
        },
        context,
      );
      expect(event).toMatchObject({
        teamId: 'team-a',
        delta: 1,
        scoringRuleId: SCORING_RULE_IDS.TOP5_RESULT,
        reason: 'top-5.win',
      });
      // The 0-5 split is the challenge's internal result and stays metadata; the
      // ledger only ever moves by one.
      expect(event.metadata).toMatchObject({
        top5Counts: { 'team-a': 3, 'team-b': 2 },
        startingTeamId: 'team-b',
      });
    });

    it('never awards more than one point however lopsided the split', () => {
      const events = scoring.score(
        SCORING_RULE_IDS.TOP5_RESULT,
        {
          teamIds: ['team-a', 'team-b'],
          top5Counts: { 'team-a': 5, 'team-b': 0 },
          trapCounts: { 'team-a': 0, 'team-b': 5 },
          contentItemId: 'item-1',
          startingTeamId: 'team-a',
          ownership: [],
        },
        context,
      );
      expect(events).toHaveLength(1);
      expect(events[0].delta).toBe(1);
    });
  });

  describe('rule contract enforcement', () => {
    const bindTestRule = (
      calculate: ScoringRuleCalculator['calculate'],
      ruleId: ScoringRuleId = SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
    ) => registry.bind({ ruleId, calculate });

    it('rejects a negative delta from a rule that declared it never emits one', () => {
      bindTestRule(() => [{ teamId: 'team-a', delta: -1, reason: 'wrong' }]);
      expect(() =>
        scoring.score(SCORING_RULE_IDS.COOP_ITEM_SUCCESS, {}, context),
      ).toThrow(ScoringRuleContractError);
    });

    it('preserves a negative delta from a rule that allows one', () => {
      bindTestRule(
        () => [{ teamId: 'team-b', delta: -1, reason: 'failed-steal' }],
        SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      );
      const [event] = scoring.score(
        SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        {},
        context,
      );
      expect(event.delta).toBe(-1);
    });

    it('rejects fractional deltas and drafts with no team or reason', () => {
      bindTestRule(() => [{ teamId: 'team-a', delta: 0.5, reason: 'half' }]);
      expect(() =>
        scoring.score(SCORING_RULE_IDS.COOP_ITEM_SUCCESS, {}, context),
      ).toThrow(ScoringRuleContractError);

      bindTestRule(() => [{ teamId: '', delta: 1, reason: 'nobody' }]);
      expect(() =>
        scoring.score(SCORING_RULE_IDS.COOP_ITEM_SUCCESS, {}, context),
      ).toThrow(ScoringRuleContractError);

      bindTestRule(() => [{ teamId: 'team-a', delta: 1, reason: '' }]);
      expect(() =>
        scoring.score(SCORING_RULE_IDS.COOP_ITEM_SUCCESS, {}, context),
      ).toThrow(ScoringRuleContractError);
    });
  });

  describe('ledger', () => {
    const event = (delta: number) =>
      scoring
        .score(
          SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS,
          {
            teamId: 'team-a',
            challengeScoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
            clearedItemCount: 3,
            totalItemCount: 3,
          },
          context,
        )
        .map((minted) => ({ ...minted, delta }) as ScoreEvent);

    it('keeps the signed total and clamps only the display total', () => {
      const ledger = new ScoreLedger();
      ledger.record(...event(-3));
      expect(ledger.signedTotal('team-a')).toBe(-3);
      expect(ledger.displayTotal('team-a')).toBe(0);
      expect(ledger.history()).toHaveLength(1);
      expect(ledger.history()[0].delta).toBe(-3);
      expect(clampScoreForDisplay(-3)).toBe(0);
    });

    it('sums signed deltas per team and keeps the full history', () => {
      const ledger = new ScoreLedger();
      ledger.record(...event(2), ...event(-1));
      expect(ledger.signedTotal('team-a')).toBe(1);
      expect(ledger.historyForTeam('team-a')).toHaveLength(2);
      expect(ledger.teamIds()).toEqual(['team-a']);
    });

    it('refuses a score event that a mechanic built outside the scoring module', () => {
      const ledger = new ScoreLedger();
      const forged = {
        id: 'forged',
        matchId: 'match-1',
        teamId: 'team-a',
        challengeSessionId: 'challenge-1',
        scoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
        delta: 99,
        reason: 'hand-rolled',
        createdAt: new Date(),
      } as unknown as ScoreEvent;
      expect(isScoreEvent(forged)).toBe(false);
      expect(() => ledger.record(forged)).toThrow(ForeignScoreEventError);
      expect(ledger.signedTotal('team-a')).toBe(0);
    });
  });
});
