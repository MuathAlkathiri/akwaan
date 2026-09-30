import { randomUUID } from 'crypto';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';

/**
 * The one place a Match hands team-turn ownership back to its session.
 *
 * A challenge that drove turns leaves the session owning an active team and a
 * clock; a challenge that never took a turn leaves nothing. Board return is the
 * boundary where that difference must stop mattering, because the next launch
 * cannot be asked to know which mechanic ran before it. Both routes back to a
 * selectable board — the result screen's continue, and an aborted challenge —
 * call this and nothing else calls it, so the cleanup exists once rather than
 * inside each launcher that happens to care.
 *
 * Returns whether a turn was actually released, which is `false` for the common
 * case of a mechanic that never took one.
 */
export async function releaseSessionTurnForBoardReturn(input: {
  sessions: LiveGameSessionRepository;
  sessionId: string;
  reason: string;
  now: Date;
}): Promise<boolean> {
  const session = await input.sessions.findById(input.sessionId);
  if (!session) return false;
  const expectedRevision = session.revision;
  if (!session.releaseChallengeTurn(input.reason, input.now)) return false;
  session.completeCommand(randomUUID(), input.now);
  await input.sessions.save(session, expectedRevision);
  return true;
}
