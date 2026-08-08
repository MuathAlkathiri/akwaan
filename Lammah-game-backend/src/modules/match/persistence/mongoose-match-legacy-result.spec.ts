import { Model } from 'mongoose';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { MongooseMatchRepository } from './mongoose-match.repository';
import { MatchDocument } from './match.schema';

/**
 * Matches stored before Match scoring was normalised still open.
 *
 * Their challenge results carry `teamPoints` — whatever the mechanic minted,
 * which for RYO was three signed payoff swings — and none of the fields the new
 * result shape adds. Restoring has to read those documents under the new names
 * without inventing a ledger they never had: the events they were scored from
 * are immutable, and re-deriving a point from a stored margin would be writing
 * history rather than reading it.
 *
 * So: renamed on the way in, never rewritten. A legacy Match keeps the board it
 * was actually played to, and every challenge finished after the fix scores one.
 */

const NOW = '2026-08-08T10:00:00.000Z';

/** A Match document written by the pre-normalisation code path. */
function legacyDocument(): Record<string, unknown> {
  return {
    matchId: 'match-legacy',
    liveSessionId: 'session-legacy',
    setupMode: 'unified',
    status: 'active',
    stage: 'board',
    stageEnteredAt: NOW,
    revision: 7,
    processedCommandIds: [],
    teams: [
      { id: 'team-a', name: 'الأخضر' },
      { id: 'team-b', name: 'الوردي' },
    ],
    selections: [],
    occurrences: [],
    configuredBoardPositions: [],
    // Three signed RYO payoff events: exactly the ledger that read 2–1.
    scoreEvents: [
      {
        id: 'legacy-1',
        teamId: 'team-a',
        delta: 1,
        reason: 'ryo.trust',
        scoringRuleId: 'ryo.payoff-matrix',
        matchId: 'match-legacy',
        challengeSessionId: 'runtime-legacy',
        createdAt: NOW,
        metadata: {},
      },
      {
        id: 'legacy-2',
        teamId: 'team-b',
        delta: 1,
        reason: 'ryo.trust',
        scoringRuleId: 'ryo.payoff-matrix',
        matchId: 'match-legacy',
        challengeSessionId: 'runtime-legacy',
        createdAt: NOW,
        metadata: {},
      },
      {
        id: 'legacy-3',
        teamId: 'team-b',
        delta: 1,
        reason: 'ryo.steal',
        scoringRuleId: 'ryo.payoff-matrix',
        matchId: 'match-legacy',
        challengeSessionId: 'runtime-legacy',
        createdAt: NOW,
        metadata: {},
      },
    ],
    challengeResults: [
      {
        id: 'result-legacy',
        challengeSessionId: 'runtime-legacy',
        occurrenceIndex: 0,
        slotKey: 'read-your-opponent',
        challengeKey: 'read-your-opponent',
        selectedScopeIds: ['scope-1'],
        contentItemIds: ['item-1'],
        winnerTeamId: 'team-b',
        // The old field name, holding the mechanic's own totals.
        teamPoints: [
          { teamId: 'team-a', points: 1 },
          { teamId: 'team-b', points: 2 },
        ],
        scoreEventIds: ['legacy-1', 'legacy-2', 'legacy-3'],
        startedAt: NOW,
        completedAt: NOW,
      },
    ],
    createdAt: NOW,
    startedAt: NOW,
  };
}

function repositoryReturning(document: Record<string, unknown>) {
  const model = {
    findOne: () => ({
      lean: () => ({ exec: () => Promise.resolve(document) }),
    }),
  } as unknown as Model<MatchDocument>;
  return new MongooseMatchRepository(
    model,
    new ScoringService(new ScoringRuleRegistry()),
  );
}

describe('restoring a Match stored before scoring was normalised', () => {
  it('reads the old teamPoints under the new name without rewriting them', async () => {
    const match =
      await repositoryReturning(legacyDocument()).findById('match-legacy');

    const [result] = match!.serialize().challengeResults;
    expect(result.matchPoints).toEqual([
      { teamId: 'team-a', points: 1 },
      { teamId: 'team-b', points: 2 },
    ]);
    // Nothing invented: the document had no Match-point event, so neither does
    // the restored result.
    expect(result.matchPointEventId).toBeNull();
    expect(result.mechanicScoreEvents).toEqual([]);
    expect(result.details).toEqual({});
  });

  it('derives tie from the winner the document already recorded', async () => {
    const withWinner =
      await repositoryReturning(legacyDocument()).findById('match-legacy');
    expect(withWinner!.serialize().challengeResults[0].tie).toBe(false);

    const drawn = legacyDocument();
    (drawn.challengeResults as Array<Record<string, unknown>>)[0].winnerTeamId =
      null;
    const tied = await repositoryReturning(drawn).findById('match-legacy');
    expect(tied!.serialize().challengeResults[0].tie).toBe(true);
  });

  it('leaves the board a legacy Match was actually played to', async () => {
    const match =
      await repositoryReturning(legacyDocument()).findById('match-legacy');

    // Still 2–1: those three events are what this Match was scored from, and
    // reading it is not the moment to re-adjudicate them.
    expect(match!.teamScore('team-a').displayTotal).toBe(1);
    expect(match!.teamScore('team-b').displayTotal).toBe(2);
  });
});
