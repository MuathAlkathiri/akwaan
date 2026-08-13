import { Injectable } from '@nestjs/common';
import { ScoringService } from '../../scoring/application/scoring.service';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { ScoreEvent } from '../../scoring/domain/score-event';
import { MatchDomainError } from '../domain/match.errors';

/**
 * The one collector for every mechanic.
 *
 * Both implemented runtimes persist their minted events at the same key
 * (`scoreEventsJson`), so a per-mechanic collector would be pure duplication. The
 * events are rehydrated through the scoring module — the only place allowed to
 * re-brand them — and correlated by `challengeSessionId`, never by the historical
 * `matchId`, which still carries the live-session id as provenance.
 */
@Injectable()
export class RuntimeScoreEventCollector {
  constructor(private readonly scoring: ScoringService) {}

  collect(runtime: GameplayRuntimeState, runtimeId: string): ScoreEvent[] {
    const raw = runtime.runtimeState?.scoreEventsJson;
    if (raw === undefined || raw === null || raw === '') return [];
    if (typeof raw !== 'string') {
      throw new MatchDomainError(
        'RUNTIME_SCORE_EVENTS_INVALID',
        'Persisted score events were not stored as JSON text',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new MatchDomainError(
        'RUNTIME_SCORE_EVENTS_INVALID',
        'Persisted score events could not be parsed',
      );
    }
    if (!Array.isArray(parsed)) {
      throw new MatchDomainError(
        'RUNTIME_SCORE_EVENTS_INVALID',
        'Persisted score events must be a list',
      );
    }
    // Malformed entries throw inside the scoring module rather than being dropped.
    const events = this.scoring.restoreEvents(parsed);
    const foreign = events.filter(
      (event) => event.challengeSessionId !== runtimeId,
    );
    if (foreign.length) {
      throw new MatchDomainError(
        'RUNTIME_SCORE_EVENTS_MISCORRELATED',
        'A persisted score event belongs to a different gameplay runtime',
      );
    }
    return events;
  }
}
