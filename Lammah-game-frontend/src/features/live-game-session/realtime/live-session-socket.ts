import { io, type Socket } from "socket.io-client";
import { runtimeConfig } from "@/config/runtime-config";
import type {
  LiveSessionConnectionState,
  LiveSessionError,
  LiveSessionSnapshot,
} from "../model";
import type { MatchChangedEvent } from "../match/types";

type SnapshotListener = (snapshot: LiveSessionSnapshot) => void;

export class LiveSessionSocket {
  private socket?: Socket;
  private heartbeat?: number;
  private recoverSnapshot?: () => void;

  connect(input: {
    sessionId: string;
    token: string;
    onSnapshot: SnapshotListener;
    onConnection: (state: LiveSessionConnectionState) => void;
    onError: (error: LiveSessionError) => void;
    onResyncing?: () => void;
    shouldRecoverMatch?: (event: MatchChangedEvent) => boolean;
    participant?: boolean;
  }): void {
    this.disconnect();
    input.onConnection("connecting");
    const socket = io(`${runtimeConfig.apiBaseUrl}/live-game-sessions`, {
      auth: { token: input.token },
      transports: ["websocket"],
      reconnection: true,
    });
    this.socket = socket;
    let connectedBefore = false;
    let resyncPending = false;
    socket.on("connect", () => {
      input.onConnection("connected");
      socket.emit(
        input.participant
          ? "live-session:participant-subscribe"
          : "live-session:subscribe",
        { sessionId: input.sessionId },
      );
      if (input.participant && !this.heartbeat) {
        this.heartbeat = window.setInterval(
          () =>
            socket.emit("live-session:participant-heartbeat", {
              sessionId: input.sessionId,
            }),
          30_000,
        );
      }
      if (connectedBefore) this.recoverSnapshot?.();
      connectedBefore = true;
    });
    socket.io.on("reconnect_attempt", () => input.onConnection("reconnecting"));
    socket.on("disconnect", () => {
      resyncPending = false;
      input.onConnection("disconnected");
    });
    socket.on("connect_error", (error) => {
      input.onConnection("error");
      input.onError({ code: "CONNECTION_ERROR", message: error.message });
    });
    socket.on("live-session:error", input.onError);
    socket.on("live-session:snapshot", (snapshot: LiveSessionSnapshot) => {
      resyncPending = false;
      input.onSnapshot(snapshot);
    });
    const recoverSnapshot = () => {
      if (!socket.connected || resyncPending) return;
      resyncPending = true;
      input.onResyncing?.();
      socket.emit("live-session:request-snapshot", {
        sessionId: input.sessionId,
      });
    };
    this.recoverSnapshot = recoverSnapshot;
    [
      "live-session:state-changed",
      "live-session:clock-synchronized",
      "live-session:turn-changed",
      "live-session:finished",
      "live-session:participant-joined",
      // A phone coming online is what a challenge preflight is waiting for: the
      // readiness counts and the Start button are computed from presence, so a
      // host that ignores this event sits on a stale "not ready" until it
      // reloads. The server publishes it; nothing else tells us.
      "live-session:participant-presence-changed",
      "live-session:participant-ready-changed",
      "live-session:participant-team-changed",
      "live-session:participant-removed",
      "live-session:participant-credential-revoked",
      "live-session:runtime-changed",
      "live-session:round-created",
      "live-session:round-started",
      "live-session:round-paused",
      "live-session:round-resumed",
      "live-session:round-changed",
      "live-session:round-completed",
      "live-session:round-cancelled",
      "live-session:runtime-completed",
      "live-session:runtime-cancelled",
      "live-session:interaction-changed",
      "live-session:submission-received",
      "live-session:submission-changed",
      "live-session:interaction-resolved",
      "live-session:interaction-expired",
    ].forEach((event) => socket.on(event, recoverSnapshot));
    socket.on("live-session:match-changed", (event: MatchChangedEvent) => {
      if (input.shouldRecoverMatch?.(event) === false) return;
      recoverSnapshot();
    });
    socket.on("live-session:gameplay-error", (error: LiveSessionError) => {
      input.onError(error);
      if (error.code === "GAMEPLAY_RUNTIME_NOT_FOUND") {
        window.setTimeout(recoverSnapshot, 500);
      }
    });
  }

  requestSnapshot(): void {
    this.recoverSnapshot?.();
  }

  command(
    event: string,
    command: {
      sessionId: string;
      expectedRevision?: number;
      commandId: string;
      clientTimestamp: string;
      [key: string]: unknown;
    },
  ): void {
    if (!this.socket?.connected) {
      throw new Error("Live session connection is not available");
    }
    this.socket.emit(event, command);
  }

  disconnect(): void {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.socket?.disconnect();
    this.socket = undefined;
    this.recoverSnapshot = undefined;
  }
}
