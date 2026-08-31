"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { authStorage } from "@/features/auth/storage/auth-storage";
import { teamColorVariables } from "@/lib/team-palette";
import {
  acknowledgePresentationReady,
  getLiveSession,
  setMatchDouble,
} from "../api/live-session-api";
import {
  LiveSessionContext,
  type GameplayCommandOptions,
  type LiveSessionCommandOptions,
} from "../hooks/live-session-context";
import { LiveSessionClockContext } from "../hooks/live-session-clock-context";
import { LiveSessionSocket } from "../realtime/live-session-socket";
import { liveSessionReducer } from "../state/live-session-reducer";

export function LiveSessionProvider({
  sessionId,
  children,
  participantCredential,
  initialSnapshot,
}: {
  sessionId: string;
  children: ReactNode;
  participantCredential?: string;
  initialSnapshot?: import("../model").LiveSessionSnapshot;
}) {
  const initial = useQuery({
    queryKey: ["live-game-session", sessionId],
    queryFn: () => getLiveSession(sessionId),
    enabled: Boolean(sessionId) && !participantCredential,
    initialData: initialSnapshot,
    staleTime: 0,
  });
  const [state, dispatch] = useReducer(liveSessionReducer, {
    connection: "connecting",
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [syncState, setSyncState] = useState<
    "idle" | "resynchronizing" | "restored"
  >("idle");
  const socketRef = useRef<LiveSessionSocket>();
  const snapshotRef = useRef(state.snapshot);
  const syncStateRef = useRef(syncState);
  const restoredTimerRef = useRef<number>();

  useEffect(() => {
    snapshotRef.current = state.snapshot;
  }, [state.snapshot]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const adoptSnapshot = useCallback(
    (snapshot: import("../model").LiveSessionSnapshot) => {
      dispatch({ type: "snapshot", snapshot, receivedAtMs: Date.now() });
    },
    [],
  );

  useEffect(() => {
    if (initial.data) {
      dispatch({
        type: "snapshot",
        snapshot: initial.data,
        receivedAtMs: Date.now(),
      });
    }
  }, [initial.data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = participantCredential ?? authStorage.getToken();
    if (!token) {
      dispatch({
        type: "error",
        error: { code: "UNAUTHORIZED", message: "Authentication is required" },
      });
      return;
    }
    const socket = new LiveSessionSocket();
    socketRef.current = socket;
    socket.connect({
      sessionId,
      token,
      onSnapshot: (snapshot) => {
        adoptSnapshot(snapshot);
        if (syncStateRef.current === "resynchronizing") {
          window.clearTimeout(restoredTimerRef.current);
          // The first socket snapshot is initial hydration, not a recovery.
          // Only an already-rendered Match can genuinely return from a resync.
          if (snapshotRef.current) {
            setSyncState("restored");
            restoredTimerRef.current = window.setTimeout(
              () => setSyncState("idle"),
              1800,
            );
          } else {
            setSyncState("idle");
          }
        }
      },
      onConnection: (connection) =>
        dispatch({ type: "connection", connection }),
      onError: (error) => dispatch({ type: "error", error }),
      onResyncing: () =>
        setSyncState(snapshotRef.current ? "resynchronizing" : "idle"),
      shouldRecoverMatch: (event) => {
        const match = snapshotRef.current?.match;
        if (match && event.matchId !== match.id) return false;
        return !match || event.matchRevision > match.revision;
      },
      participant: Boolean(participantCredential),
    });
    return () => {
      window.clearTimeout(restoredTimerRef.current);
      socket.disconnect();
      socketRef.current = undefined;
    };
  }, [adoptSnapshot, participantCredential, sessionId]);

  useEffect(() => {
    const restore = () => {
      if (document.visibilityState === "visible") {
        socketRef.current?.requestSnapshot();
      }
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, []);

  const resync = useCallback(() => socketRef.current?.requestSnapshot(), []);

  const updateMatchDouble = useCallback(
    async (armed: boolean, assignmentSequence: number) => {
      const match = snapshotRef.current?.match;
      if (!participantCredential || !match) return;
      const next = await setMatchDouble(sessionId, participantCredential, {
        commandId: crypto.randomUUID(),
        expectedMatchRevision: match.revision,
        assignmentSequence,
        armed,
      });
      adoptSnapshot(next);
    },
    [adoptSnapshot, participantCredential, sessionId],
  );

  const command = useCallback(
    (action: string, options: LiveSessionCommandOptions = {}) => {
      if (!state.snapshot) return;
      socketRef.current?.command(`live-session:${action}`, {
        sessionId,
        expectedRevision: state.snapshot.revision,
        commandId: crypto.randomUUID(),
        clientTimestamp: new Date().toISOString(),
        ...options,
      });
    },
    [sessionId, state.snapshot],
  );

  const gameplayCommand = useCallback(
    (action: string, options: GameplayCommandOptions = {}) => {
      if (!state.snapshot?.gameplay) return;
      socketRef.current?.command(
        `live-session:${action}`,
        {
          sessionId,
          expectedSessionRevision: state.snapshot.revision,
          expectedRuntimeRevision: state.snapshot.gameplay.revision,
          expectedInteractionRevision:
            state.snapshot.gameplay.activeRound?.interaction?.revision,
          commandId: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
          ...options,
        },
        // Read from the ref, not the closure: the whole point of the retry is
        // that the revisions captured when the player pressed are out of date.
        () => {
          const latest = snapshotRef.current;
          if (!latest?.gameplay) return undefined;
          return {
            expectedSessionRevision: latest.revision,
            expectedRuntimeRevision: latest.gameplay.revision,
            expectedInteractionRevision:
              latest.gameplay.activeRound?.interaction?.revision,
          };
        },
      );
    },
    [sessionId, state.snapshot],
  );

  // Fair-start: tell the server this surface has adopted the runtime and can
  // present it. The revisions come from the caller (the renderer, reading the
  // exact awaiting snapshot on screen), NOT from `snapshotRef` — a cold-open or
  // refresh into an already-awaiting runtime used to race the ref and drop the
  // acknowledgement silently. The promise resolves once the server accepted it
  // (and the adopted snapshot reflects the activation immediately) and rejects
  // otherwise, so the caller pins only a real success and retries a real failure.
  // Activation is idempotent server-side, so a duplicate is harmless.
  const presentationReady = useCallback(
    (input: {
      expectedSessionRevision: number;
      expectedRuntimeRevision: number;
    }) =>
      acknowledgePresentationReady(sessionId, {
        commandId: crypto.randomUUID(),
        expectedSessionRevision: input.expectedSessionRevision,
        expectedRuntimeRevision: input.expectedRuntimeRevision,
      }).then((next) => {
        adoptSnapshot(next);
      }),
    [sessionId, adoptSnapshot],
  );

  /**
   * Fair-start acknowledgement for the multi-surface contract (RYO). Unlike the
   * HTTP path, this goes through the socket so the server can bind the ack to
   * the exact connection (`client.id`) and withdraw it on disconnect. The server
   * derives the surface capability from the actor identity; the client never
   * claims a role. Emitting is fire-and-forget, like every other socket command:
   * the server broadcasts the activation (or a withheld state) back and the
   * surface re-acknowledges on the next authoritative snapshot if it is still
   * awaiting. It rejects if this surface has no live connection to ack from.
   */
  const presentationReadySocket = useCallback(
    (input: {
      expectedSessionRevision: number;
      expectedRuntimeRevision: number;
    }) => {
      const socket = socketRef.current;
      if (!socket) return Promise.reject(new Error("No live session connection"));
      try {
        socket.presentationReady({
          sessionId,
          commandId: crypto.randomUUID(),
          expectedSessionRevision: input.expectedSessionRevision,
          expectedRuntimeRevision: input.expectedRuntimeRevision,
        });
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    [sessionId],
  );

  // Deliberately without `nowMs`. The clock ticks four times a second, and
  // while it was part of this object every tick handed all ~29 consumers a new
  // value and rerendered them for a change none of them had asked about. It is
  // published on its own context below, so a tick now reaches only the
  // components that draw time.
  const value = useMemo(
    () => ({
      snapshot: state.snapshot,
      connection: state.connection,
      error:
        state.error ??
        (initial.error
          ? { code: "LOAD_FAILED", message: "Unable to load live session" }
          : undefined),
      snapshotReceivedAtMs: state.snapshotReceivedAtMs,
      syncState,
      command,
      gameplayCommand,
      presentationReady,
      presentationReadySocket,
      adoptSnapshot,
      resync,
      setMatchDouble: updateMatchDouble,
    }),
    [
      command,
      gameplayCommand,
      presentationReady,
      presentationReadySocket,
      adoptSnapshot,
      initial.error,
      state.connection,
      state.error,
      state.snapshot,
      state.snapshotReceivedAtMs,
      syncState,
      resync,
      updateMatchDouble,
    ],
  );

  // Memoised for the same reason: this provider still rerenders on every tick
  // because it owns the clock, and an unmemoised style object would hand the
  // wrapper below a new prop each time and undo the isolation.
  const teamColors = useMemo(
    () => teamColorVariables(state.snapshot?.teams ?? []),
    [state.snapshot?.teams],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      <LiveSessionClockContext.Provider value={nowMs}>
        {/**
         * The teams' colours, applied once for every screen inside a session.
         *
         * Both clients read the same two ids off the same snapshot, so the shared
         * screen and every phone resolve `--team-{n}-*` to the same hues without
         * exchanging anything. Placing this here rather than in each surface is what
         * stops one screen from picking its own colours again.
         */}
        <div data-testid="team-colour-scope" style={teamColors}>
          {children}
        </div>
      </LiveSessionClockContext.Provider>
    </LiveSessionContext.Provider>
  );
}
