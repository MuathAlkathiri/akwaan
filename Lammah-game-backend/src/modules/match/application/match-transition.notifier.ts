import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from '../../live-game-sessions/application/live-session-transition.publisher';
import { Match } from '../domain/match';
import { MatchStage, MatchStatus } from '../domain/match.constants';

export const MATCH_CHANGED_EVENT = 'live-session:match-changed';

/** Why the Match changed, so a client can pick an animation without guessing. */
export type MatchTransitionReason =
  | 'created'
  | 'challenge-prepared'
  | 'preflight-cancelled'
  | 'double-updated'
  | 'challenge-launched'
  | 'challenge-completed'
  | 'result-acknowledged'
  | 'match-completed'
  | 'cancelled';

export interface MatchChangedPayload {
  matchId: string;
  matchRevision: number;
  stage: MatchStage;
  status: MatchStatus;
  reason: MatchTransitionReason;
}

/**
 * One notification for every authoritative Match change.
 *
 * It deliberately carries no Match state beyond identity, revision, and stage:
 * clients react by reading the snapshot they already subscribe to, which is the
 * only place `match` is projected. Nothing private to a mechanic, a ContentItem,
 * or a ScoreEvent travels on this channel.
 */
@Injectable()
export class MatchTransitionNotifier {
  constructor(
    @Inject(LIVE_SESSION_TRANSITION_PUBLISHER)
    private readonly publisher: LiveSessionTransitionPublisher,
  ) {}

  /** Call only after the Match has been persisted. */
  publish(match: Match, reason: MatchTransitionReason): void {
    const payload: MatchChangedPayload = {
      matchId: match.id,
      matchRevision: match.revision,
      stage: match.stage,
      status: match.status,
      reason,
    };
    this.publisher.publishEvent(match.liveSessionId, MATCH_CHANGED_EVENT, {
      ...payload,
    });
  }

  /**
   * The reason a finished challenge produced, read from where the Match landed.
   *
   * A challenge now completes *into* the result stage rather than back onto the
   * board, so `challenge-completed` no longer implies the board is showing.
   */
  completionReason(match: Match): MatchTransitionReason {
    if (match.status === MatchStatus.COMPLETED) return 'match-completed';
    return 'challenge-completed';
  }

  /** Where the Match went after the host left the result screen. */
  continueReason(match: Match): MatchTransitionReason {
    if (match.stage === MatchStage.MATCH_COMPLETE) return 'match-completed';
    return 'result-acknowledged';
  }
}
