import { createLiveSession } from "@/features/live-game-session/api/live-session-api";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";
import {
  createUnifiedMatch,
  markLiveSessionReady,
  startLiveSession,
} from "./unified-match.api";
import type { MatchSetupError } from "../errors/match-setup-errors";
import { toMatchSetupError } from "../errors/match-setup-errors";
import {
  toCreateUnifiedMatchRequest,
  type MatchSetupDraft,
} from "../state/match-setup-draft";

/**
 * Turning a finished draft into a real Match.
 *
 * Four server calls, in one direction, only after the host confirms: create the
 * session with its two teams, leave the lobby, start it, then create the whole
 * Match in a single request. Nothing before that line touches the server.
 *
 * If the session is created and the Match then fails, the session is cancelled so
 * no orphan is left behind and the host is not told setup completed. The draft is
 * never cleared by this function — the caller clears it only after a Match exists.
 */

export interface ConfiguredMatchCreation {
  sessionId: string;
  reconnectToken: string;
  snapshot: LiveSessionSnapshot;
}

export class MatchSetupFailure extends Error {
  constructor(
    readonly detail: MatchSetupError,
    /** True when a session was created and has since been cancelled. */
    readonly sessionRolledBack: boolean,
  ) {
    super(detail.message);
    this.name = "MatchSetupFailure";
  }
}

export interface CreateConfiguredMatchDependencies {
  createSession: typeof createLiveSession;
  markReady: typeof markLiveSessionReady;
  startSession: typeof startLiveSession;
  createMatch: typeof createUnifiedMatch;
  cancelSession: (sessionId: string, expectedRevision: number) => Promise<unknown>;
}

export async function createConfiguredMatch(
  draft: MatchSetupDraft,
  dependencies: CreateConfiguredMatchDependencies,
): Promise<ConfiguredMatchCreation> {
  // Throws on an incomplete draft before any request is made: the wizard's own
  // gating is the first line of defence, the backend is the authority.
  const request = toCreateUnifiedMatchRequest(draft);
  const teamNames = draft.teamNames.map((name) => name.trim());

  let created: Awaited<ReturnType<typeof createLiveSession>>;
  try {
    created = await dependencies.createSession({ teamNames });
  } catch (cause) {
    // Nothing exists yet, so there is nothing to undo.
    throw new MatchSetupFailure(toMatchSetupError(cause), false);
  }

  const sessionId = created.snapshot.sessionId;
  let revision = created.snapshot.revision;
  try {
    // Two teams and no phones is a legitimate starting room: players join later,
    // during challenge preflight, and the board does not wait for them.
    revision = (await dependencies.markReady(sessionId, revision)).revision;
    const started = await dependencies.startSession(sessionId, revision);
    revision = started.revision;
    const snapshot = await dependencies.createMatch(sessionId, request);
    return {
      sessionId,
      reconnectToken: created.reconnectToken,
      snapshot,
    };
  } catch (cause) {
    const detail = toMatchSetupError(cause);
    // The session outlived the failure, so it is cancelled rather than left as an
    // orphan the host can neither see nor use.
    const rolledBack = await cancelQuietly(
      dependencies,
      sessionId,
      revision,
    );
    throw new MatchSetupFailure(detail, rolledBack);
  }
}

async function cancelQuietly(
  dependencies: CreateConfiguredMatchDependencies,
  sessionId: string,
  expectedRevision: number,
): Promise<boolean> {
  try {
    await dependencies.cancelSession(sessionId, expectedRevision);
    return true;
  } catch {
    // The original failure is what the host needs to hear about; a failed
    // cleanup must not replace it. The session is left cancellable by hand.
    return false;
  }
}
