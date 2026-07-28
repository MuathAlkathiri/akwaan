import { io, type Socket } from "socket.io-client";
import { runtimeConfig } from "@/config/runtime-config";
import type {
  LiveSessionConnectionState,
  LiveSessionError,
  LiveSessionSnapshot,
} from "../model";

type SnapshotListener = (snapshot: LiveSessionSnapshot) => void;

export class LiveSessionSocket {
  private socket?: Socket;
  private heartbeat?: number;

  connect(input: {
    sessionId: string;
    token: string;
    onSnapshot: SnapshotListener;
    onConnection: (state: LiveSessionConnectionState) => void;
    onError: (error: LiveSessionError) => void;
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
    });
    socket.io.on("reconnect_attempt", () => input.onConnection("reconnecting"));
    socket.on("disconnect", () => input.onConnection("disconnected"));
    socket.on("connect_error", (error) => {
      input.onConnection("error");
      input.onError({ code: "CONNECTION_ERROR", message: error.message });
    });
    socket.on("live-session:error", input.onError);
    socket.on("live-session:snapshot", input.onSnapshot);
    const recoverSnapshot = () =>
      socket.emit("live-session:request-snapshot", {
        sessionId: input.sessionId,
      });
    [
      "live-session:state-changed",
      "live-session:clock-synchronized",
      "live-session:turn-changed",
      "live-session:finished",
      "live-session:participant-joined",
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
    socket.on("live-session:gameplay-error", (error: LiveSessionError) => {
      input.onError(error);
      if (error.code === "GAMEPLAY_RUNTIME_NOT_FOUND") {
        window.setTimeout(recoverSnapshot, 500);
      }
    });
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
  }
}
