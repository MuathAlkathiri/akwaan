import { Inject, Injectable } from '@nestjs/common';
import {
  LIVE_SESSION_TRANSITION_PUBLISHER,
  LiveSessionTransitionPublisher,
} from '../../live-game-sessions/application/live-session-transition.publisher';
import { Match } from '../domain/match';
import {
  MATCH_WORLD_OCCURRENCE_COUNT,
  MatchStage,
  MatchStatus,
} from '../domain/match.constants';

export const MATCH_CHANGED_EVENT = 'live-session:match-changed';

/** Why the Match changed, so a client can pick an animation without guessing. */
export type MatchTransitionReason =
  | 'created'
  | 'challenge-prepared'
  | 'preflight-cancelled'
  | 'challenge-launched'
  | 'challenge-completed'
  | 'match-completed'
  | 'cancelled'
  // Legacy sequential setup only; Phase 5 removes these five.
  | 'started'
  | 'coin-toss-resolved'
  | 'world-selected'
  | 'world-selection-completed'
  | 'scopes-selected'
  | 'world-completed'
  | 'advanced-to-next-world';

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
   * The reason a World selection produced: the third one closes selection.
   *
   * @deprecated Legacy sequential only. A preconfigured Match announces its whole
   * setup once, as `created`.
   */
  worldSelectionReason(match: Match): MatchTransitionReason {
    return match.selections.length === MATCH_WORLD_OCCURRENCE_COUNT
      ? 'world-selection-completed'
      : 'world-selected';
  }

  /** The reason a finished challenge produced, read from where the Match landed. */
  completionReason(match: Match): MatchTransitionReason {
    if (match.status === MatchStatus.COMPLETED) return 'match-completed';
    if (match.stage === MatchStage.WORLD_COMPLETE) return 'world-completed';
    return 'challenge-completed';
  }
}
