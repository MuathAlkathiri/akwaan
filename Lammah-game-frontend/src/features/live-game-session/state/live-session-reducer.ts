import type {
  LiveSessionConnectionState,
  LiveSessionError,
  LiveSessionSnapshot,
} from "../model";

export interface LiveSessionState {
  snapshot?: LiveSessionSnapshot;
  snapshotReceivedAtMs?: number;
  connection: LiveSessionConnectionState;
  error?: LiveSessionError;
}

export type LiveSessionAction =
  | {
      type: "snapshot";
      snapshot: LiveSessionSnapshot;
      receivedAtMs: number;
    }
  | { type: "connection"; connection: LiveSessionConnectionState }
  | { type: "error"; error: LiveSessionError }
  | { type: "clear-error" };

export function liveSessionReducer(
  state: LiveSessionState,
  action: LiveSessionAction,
): LiveSessionState {
  switch (action.type) {
    case "snapshot": {
      const currentMatch = state.snapshot?.match;
      const incomingMatch = action.snapshot.match;
      const matchAdvanced = Boolean(
        currentMatch &&
          incomingMatch &&
          currentMatch.id === incomingMatch.id &&
          incomingMatch.revision > currentMatch.revision,
      );
      if (
        state.snapshot &&
        action.snapshot.sessionId === state.snapshot.sessionId &&
        action.snapshot.revision < state.snapshot.revision
      ) {
        return state;
      }
      if (
        currentMatch &&
        incomingMatch &&
        currentMatch.id === incomingMatch.id &&
        incomingMatch.revision < currentMatch.revision
      ) {
        return state;
      }
      if (
        currentMatch &&
        !incomingMatch &&
        action.snapshot.revision <= (state.snapshot?.revision ?? -1)
      ) {
        return state;
      }
      if (
        state.snapshot?.gameplay &&
        action.snapshot.gameplay &&
        action.snapshot.gameplay.runtimeId ===
          state.snapshot.gameplay.runtimeId &&
        action.snapshot.gameplay.revision < state.snapshot.gameplay.revision
      ) {
        return state;
      }
      if (
        state.snapshot?.gameplay &&
        !action.snapshot.gameplay &&
        action.snapshot.revision <= state.snapshot.revision &&
        !matchAdvanced
      ) {
        return state;
      }
      return {
        ...state,
        snapshot: action.snapshot,
        snapshotReceivedAtMs: action.receivedAtMs,
        error: undefined,
      };
    }
    case "connection":
      return { ...state, connection: action.connection };
    case "error":
      return { ...state, error: action.error };
    case "clear-error":
      return { ...state, error: undefined };
  }
}
