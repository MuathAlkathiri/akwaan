import { randomUUID } from 'crypto';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';

/**
 * The one place a Match hands team-turn ownership back to its session.
 *
 * A challenge that drove turns leaves the session owning an active team and a
 * clock; a challenge that never took a turn leaves nothing. The end of the
 * challenge is the boundary where that difference must stop mattering, because
 * the next launch cannot be asked to know which mechanic ran before it. Every
 * route out of a challenge — reconciled completion, an aborted runtime, and the
 * result screen's continue behind them — calls this, so the cleanup exists once
 * rather than inside each launcher that happens to care. It is idempotent, so
 * the later routes are free safety nets for the earlier ones.
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
