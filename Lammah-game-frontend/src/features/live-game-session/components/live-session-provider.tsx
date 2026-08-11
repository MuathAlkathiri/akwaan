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
import { getLiveSession, setMatchDouble } from "../api/live-session-api";
import {
  LiveSessionContext,
  type GameplayCommandOptions,
  type LiveSessionCommandOptions,
} from "../hooks/live-session-context";
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

  const value = useMemo(
    () => ({
      snapshot: state.snapshot,
      connection: state.connection,
      error:
        state.error ??
        (initial.error
          ? { code: "LOAD_FAILED", message: "Unable to load live session" }
          : undefined),
      nowMs,
      snapshotReceivedAtMs: state.snapshotReceivedAtMs,
      syncState,
      command,
      gameplayCommand,
      adoptSnapshot,
      resync,
      setMatchDouble: updateMatchDouble,
    }),
    [
      command,
      gameplayCommand,
      adoptSnapshot,
      initial.error,
      nowMs,
      state.connection,
      state.error,
      state.snapshot,
      state.snapshotReceivedAtMs,
      syncState,
      resync,
      updateMatchDouble,
    ],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
    </LiveSessionContext.Provider>
  );
}
