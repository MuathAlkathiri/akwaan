import { Inject, Injectable } from '@nestjs/common';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';

/** What a Match is showing right now, for a reader outside this module. */
export interface PresentedContent {
  matchId: string;
  /**
   * The account that owns the Match — the live session's controller, the same
   * definition the exposure ledger uses, so anything counted here can be read
   * beside how often the item was shown.
   */
  ownerAccountId: string;
  challengeTypeKey: string;
  contentItemIds: readonly string[];
}

/**
 * The one window other modules get into a Match's current content.
 *
 * It exists so that a feature which needs to know what a player is looking at
 * — a verdict on a question, say — does not reach for the Match repository and
 * start reading whatever else it finds. What leaves here is the launched
 * challenge and its items, and nothing about teams, scores or the board.
 */
@Injectable()
export class MatchPresentedContentLookup {
  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
  ) {}

  /**
   * The challenge on screen in this session, or null when none is launched.
   *
   * Null is an ordinary answer: between challenges there is nothing to have an
   * opinion about, and a verdict that arrives then is one the caller refuses.
   */
  async forSession(sessionId: string): Promise<PresentedContent | null> {
    const match = await this.matches.findActiveBySessionId(sessionId);
    const challenge = match?.currentChallenge;
    if (!match || !challenge) return null;
    const session = await this.sessions.findById(sessionId);
    if (!session) return null;
    return {
      matchId: match.id,
      ownerAccountId: session.controllerActorId,
      challengeTypeKey: challenge.challengeKey,
      contentItemIds: [...challenge.contentItemIds],
    };
  }
}
