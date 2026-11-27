import { randomUUID } from 'crypto';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';

/**
 * The per-challenge team-clock budget a Match hands its session.
 *
 * Generous on purpose. A Unified Match has no product rule about a team running
 * out of time across the board — only القنبلة does, and it allocates its own
 * 30 seconds as it launches. This number exists so a clock measures one
 * challenge rather than a whole evening, not so it can run out.
 */
export const MATCH_CHALLENGE_TEAM_CLOCK_MS = 60 * 60 * 1000;

/**
 * Puts the session's team clocks back to a clean state for a launch.
 *
 * Session clocks are older than the Match: a standalone session gave each team
 * one budget for the whole game. A Match plays twelve challenges on one session,
 * so that single budget drained across the board — القنبلة overwrote it with 30
 * seconds, أفضل 5 burned it a card at a time — and the first launch that found
 * it empty was refused. Reallocating here makes every challenge start where the
 * previous one started, whatever ran before it and however long the board was
 * open.
 *
 * Best effort by design: the caller treats a failure as advisory, because a
 * spent clock no longer refuses a turn and a launch must not die over
 * bookkeeping.
 */
export async function allocateSessionClocksForLaunch(input: {
  sessions: LiveGameSessionRepository;
  sessionId: string;
  allocatedMs?: number;
  now: Date;
}): Promise<boolean> {
  const session = await input.sessions.findById(input.sessionId);
  if (!session) return false;
  // Allocation is an `active`-only seam, and a launch can be attempted while the
  // session is anything but; asking first keeps a refusal out of the log.
  if (session.serialize().status !== 'active') return false;
  const expectedRevision = session.revision;
  // A challenge that ended without the board being reached — an abandoned
  // runtime, a host who launched straight from the preflight — can still own a
  // turn, and allocation refuses while one is open.
  session.releaseChallengeTurn('challenge-launching', input.now);
  session.allocateChallengeTeamClocks(
    input.allocatedMs ?? MATCH_CHALLENGE_TEAM_CLOCK_MS,
    input.now,
  );
  session.completeCommand(randomUUID(), input.now);
  await input.sessions.save(session, expectedRevision);
  return true;
}
