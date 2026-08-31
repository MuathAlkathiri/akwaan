import { io, type Socket } from "socket.io-client";
import { runtimeConfig } from "@/config/runtime-config";
import type {
  LiveSessionConnectionState,
  LiveSessionError,
  LiveSessionSnapshot,
} from "../model";
import type { MatchChangedEvent } from "../match/types";
import {
  claimedRevisions,
  isAlreadyAdopted,
  isRegression,
  revisionsOf,
  type SnapshotRevisions,
} from "./snapshot-revisions";

type SnapshotListener = (snapshot: LiveSessionSnapshot) => void;

/** Long enough for the resynced snapshot to arrive, short enough to feel instant. */
const RETRY_DELAY_MS = 250;

/**
 * The codes the server uses when a command was decided against a revision that
 * has since moved on. They are the only failures worth resending — every other
 * refusal would fail again for the same reason.
 */
const STALE_REVISION_CODES = [
  "STALE_RUNTIME_REVISION",
  "STALE_REVISION",
  "CONCURRENT_UPDATE",
];

function isStaleRevisionAck(ack: unknown): boolean {
  if (!ack || typeof ack !== "object") return false;
  const code = (ack as { code?: unknown }).code;
  return typeof code === "string" && STALE_REVISION_CODES.includes(code);
}

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
    /** Revisions of the snapshot currently on screen. */
    let adopted: SnapshotRevisions = {};
    /**
     * A newer revision was announced while a request was already out.
     *
     * Without this, an event arriving mid-flight was dropped entirely: the
     * reply in flight had been composed before that change existed, so the
     * client adopted the older state and then sat on it until something else
     * happened to knock it loose.
     */
    let requestAgain = false;
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
      requestAgain = false;
      input.onConnection("disconnected");
    });
    socket.on("connect_error", (error) => {
      input.onConnection("error");
      input.onError({ code: "CONNECTION_ERROR", message: error.message });
    });
    socket.on("live-session:error", input.onError);
    socket.on("live-session:snapshot", (snapshot: LiveSessionSnapshot) => {
      resyncPending = false;
      const next = revisionsOf(snapshot);
      // A reply that lost a race must not roll the game backwards.
      if (!isRegression(next, adopted)) {
        adopted = { ...adopted, ...next };
        input.onSnapshot(snapshot);
      }
      if (requestAgain) {
        requestAgain = false;
        recoverSnapshot();
      }
    });
    const recoverSnapshot = () => {
      if (!socket.connected) return;
      if (resyncPending) {
        // Do not stack a second request; remember that one is owed instead.
        requestAgain = true;
        return;
      }
      resyncPending = true;
      input.onResyncing?.();
      socket.emit("live-session:request-snapshot", {
        sessionId: input.sessionId,
      });
    };
    /**
     * Fetch only if the announcement carries something we do not already hold.
     *
     * One authoritative change fans out as several events — a resolved item
     * publishes an interaction change, a round change and a Match change — and
     * each of them used to cost a full snapshot composition on the server. They
     * all name the same revisions, so the second and third are provably
     * redundant. An event that names no revision is never suppressed.
     */
    const refreshIfNewer = (payload: unknown) => {
      const claim = claimedRevisions(payload);
      if (claim && isAlreadyAdopted(claim, adopted)) return;
      recoverSnapshot();
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
    ].forEach((event) => socket.on(event, refreshIfNewer));
    socket.on("live-session:match-changed", (event: MatchChangedEvent) => {
      if (input.shouldRecoverMatch?.(event) === false) return;
      refreshIfNewer(event);
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

  /**
   * Fair-start acknowledgement over the socket. The server observes this
   * connection's `client.id` as the acknowledgement's identity, which is what
   * binds it to the exact surface (and lets a disconnect withdraw it). The RYO
   * multi-surface contract requires this — the plain HTTP acknowledgement cannot
   * carry a connection identity and is deliberately refused for multi-surface.
   */
  presentationReady(input: {
    sessionId: string;
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
    commandId: string;
    presentationGeneration?: number;
  }): void {
    if (!this.socket?.connected) {
      throw new Error("Live session connection is not available");
    }
    this.socket.emit("live-session:presentation-ready", {
      sessionId: input.sessionId,
      expectedSessionRevision: input.expectedSessionRevision,
      expectedRuntimeRevision: input.expectedRuntimeRevision,
      commandId: input.commandId,
      clientTimestamp: new Date().toISOString(),
      ...(input.presentationGeneration !== undefined
        ? { presentationGeneration: input.presentationGeneration }
        : {}),
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
    /**
     * Rebuilds the command against the revisions the client holds *now*.
     *
     * Two players answering a blind mechanic at the same moment is the normal
     * case, not a race to be avoided: whoever arrives second carries the
     * revision from before the first one landed, and the server rightly refuses
     * it. Without this the second player's press is simply lost, and the round
     * waits forever for a submission that was already made.
     */
    retryWithFreshRevisions?: () => Record<string, unknown> | undefined,
  ): void {
    if (!this.socket?.connected) {
      throw new Error("Live session connection is not available");
    }
    if (!retryWithFreshRevisions) {
      this.socket.emit(event, command);
      return;
    }
    this.socket.emit(event, command, (ack: unknown) => {
      if (!isStaleRevisionAck(ack)) return;
      // Take the newest snapshot the server has, then send the same command id
      // again: a replay of a submission that did land is refused as a duplicate,
      // so retrying can only ever fix the lost case.
      this.recoverSnapshot?.();
      window.setTimeout(() => {
        const refreshed = retryWithFreshRevisions();
        if (refreshed && this.socket?.connected) {
          this.socket.emit(event, { ...command, ...refreshed });
        }
      }, RETRY_DELAY_MS);
    });
  }

  disconnect(): void {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.socket?.disconnect();
    this.socket = undefined;
    this.recoverSnapshot = undefined;
  }
}
