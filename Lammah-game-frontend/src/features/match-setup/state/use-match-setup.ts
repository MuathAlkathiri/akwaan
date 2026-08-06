"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelLiveSession,
  createLiveSession,
} from "@/features/live-game-session/api/live-session-api";
import {
  createConfiguredMatch,
  MatchSetupFailure,
} from "../api/create-configured-match";
import {
  createUnifiedMatch,
  markLiveSessionReady,
  startLiveSession,
} from "../api/unified-match.api";
import {
  createDraft,
  isDraftComplete,
  matchSetupReducer,
  type MatchSetupAction,
  type MatchSetupDraft,
} from "./match-setup-draft";
import {
  clearStoredDraft,
  readStoredDraft,
  writeStoredDraft,
} from "./match-setup-storage";

/** The route a created Match hands off to. */
export const matchBoardRoute = (sessionId: string) => `/matches/${sessionId}`;

const DEFAULT_DEPENDENCIES = {
  createSession: createLiveSession,
  markReady: markLiveSessionReady,
  startSession: startLiveSession,
  createMatch: createUnifiedMatch,
  cancelSession: cancelLiveSession,
};

/**
 * The setup wizard's state.
 *
 * Everything is local until the host confirms: the reducer owns the draft, the
 * storage module survives a refresh, and exactly one function talks to the server.
 * A second submission is refused while the first is in flight, so a double click
 * cannot produce two sessions.
 */
export function useMatchSetup(
  dependencies: Partial<typeof DEFAULT_DEPENDENCIES> = {},
) {
  const router = useRouter();
  const [draft, dispatch] = useReducer(matchSetupReducer, undefined, createDraft);
  const [submitting, setSubmitting] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const [restored, setRestored] = useState(false);
  // Ref, not state: a second click must be refused in the same tick, before any
  // re-render could have told the button it is disabled.
  const inFlight = useRef(false);

  useEffect(() => {
    const stored = readStoredDraft();
    if (stored) dispatch({ type: "restore", draft: stored });
    setRestored(true);
  }, []);

  useEffect(() => {
    // Only persist once the initial read has happened, so an empty first render
    // cannot overwrite a recoverable draft.
    if (restored) writeStoredDraft(draft);
  }, [draft, restored]);

  const act = useCallback(
    (action: MatchSetupAction) => dispatch(action),
    [],
  );

  const start = useCallback(async () => {
    if (inFlight.current || !isDraftComplete(draft)) return;
    inFlight.current = true;
    setSubmitting(true);
    setRolledBack(false);
    dispatch({ type: "clear-issue" });
    try {
      const created = await createConfiguredMatch(draft, {
        ...DEFAULT_DEPENDENCIES,
        ...dependencies,
      });
      // The reconnect credential is the only thing worth keeping, and only for
      // this tab: it is how the host resumes the Match it just created.
      try {
        window.sessionStorage.setItem(
          `live-session-reconnect:${created.sessionId}`,
          created.reconnectToken,
        );
      } catch {
        // A storage-denied browser still has a real Match to play.
      }
      // Cleared only now that a Match actually exists.
      clearStoredDraft();
      router.push(matchBoardRoute(created.sessionId));
      return created;
    } catch (cause) {
      const failure =
        cause instanceof MatchSetupFailure
          ? cause
          : new MatchSetupFailure(
              {
                code: "UNKNOWN_ERROR",
                message: "تعذر إنشاء المباراة. حاول مرة أخرى.",
                retryable: true,
              },
              false,
            );
      setRolledBack(failure.sessionRolledBack);
      dispatch({
        type: "report-issue",
        message: failure.detail.message,
        code: failure.detail.code,
        ...(failure.detail.occurrenceIndex !== undefined
          ? { occurrenceIndex: failure.detail.occurrenceIndex }
          : {}),
      });
      return undefined;
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [dependencies, draft, router]);

  return { draft, act, start, submitting, rolledBack, restored };
}

export type MatchSetupController = ReturnType<typeof useMatchSetup>;
export type { MatchSetupDraft };
