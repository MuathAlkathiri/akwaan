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
 * How long a tracked command may go unanswered before its outcome is unknown.
 *
 * Transport only. It never touches a gameplay clock: the server alone decides
 * when a turn runs out, and an answer that reaches it late loses to the clock.
 */
const COMMAND_ACK_TIMEOUT_MS = 4_000;

/**
 * Sends of one command, the first included. Every resend reuses the same
 * command id, which the server treats as a duplicate once it has processed it —
 * so a resend can recover a lost command but never apply one twice.
 */
const MAX_COMMAND_ATTEMPTS = 3;

/**
 * How long the liveness probe may go unanswered before the connection is
 * treated as dead.
 *
 * A phone that slept, or moved between Wi-Fi and mobile data, can hold a
 * connection that still reads `connected` but carries nothing — Socket.IO only
 * notices after its own ping timeout, up to ~45 s, longer than a Bomb team's
 * whole clock. The probe is the existing participant heartbeat, which every
 * live connection answers at once; silence after an already-unanswered command
 * is the evidence that this connection, not the server, is the problem.
 */
const LIVENESS_PROBE_TIMEOUT_MS = 2_500;

/** How long to wait for a replacement connection before giving the answer back. */
const RECONNECT_WAIT_MS = 8_000;

/**
 * How long to wait for authoritative state before a retry is decided.
 *
 * A retry is only ever decided against state the server sent *after* the
 * reason to retry arose — never against what the phone already held.
 */
const SNAPSHOT_WAIT_MS = 3_000;

/**
 * Builds a command's retry from the newest authoritative snapshot, or says the
 * command no longer applies (`undefined`). The snapshot is the one the socket
 * itself has just adopted, so the decision never reads a ref that has not
 * caught up with it yet.
 */
export type CommandRetryBuilder = (
  latest?: LiveSessionSnapshot,
) => Record<string, unknown> | undefined;

/** What became of a tracked command, as far as the server has said. */
export type CommandOutcome =
  /** The server processed it. `runtimeRevision` is the state it answered with. */
  | { status: "accepted"; runtimeRevision?: number }
  /** The server refused it on its merits. Final. */
  | { status: "rejected"; code: string; message?: string }
  /** The caller's state moved on before a resend, so none was sent. */
  | { status: "superseded" }
  /** No answer after every allowed send. It may or may not have landed. */
  | { status: "unknown" };
const MAX_PRESENTATION_RETRIES = 10;

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

/**
 * How long a `request-snapshot` may stay unanswered before the channel reopens.
 *
 * Long enough that a slow reply is not double-requested, short enough that a
 * player waiting between questions does not notice. It is a ceiling, not a
 * poll: nothing re-requests unless a newer revision was announced meanwhile.
 */
const RESYNC_REPLY_TIMEOUT_MS = 5_000;

/**
 * Recovery reconnects allowed inside one window. The server asks a live socket
 * to reconnect when its presence entry was removed elsewhere; a bound keeps a
 * misbehaving server from turning that into a reconnect storm.
 */
const MAX_PRESENCE_RECOVERIES = 5;
const PRESENCE_RECOVERY_WINDOW_MS = 5 * 60_000;

function isStaleRevisionAck(ack: unknown): boolean {
  if (!ack || typeof ack !== "object") return false;
  const code = (ack as { code?: unknown }).code;
  return typeof code === "string" && STALE_REVISION_CODES.includes(code);
}

export class LiveSessionSocket {
  private socket?: Socket;
  private heartbeat?: number;
  private recoverSnapshot?: () => void;
  private sessionId?: string;
  /** The newest snapshot this connection adopted, and how many it has. */
  private latest?: LiveSessionSnapshot;
  private snapshotCount = 0;
  private snapshotWaiters = new Set<() => void>();
  /** How many times a connection has been (re)established. */
  private connectionCount = 0;
  private connectionWaiters = new Set<() => void>();
  /** Replace a connection that has been shown to carry nothing. */
  private replaceConnection?: () => void;
  private checking = false;
  /** Marks the current connection as intentionally closed by this client. */
  private closeCurrent?: () => void;

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
    this.sessionId = input.sessionId;
    input.onConnection("connecting");
    const socket = io(`${runtimeConfig.apiBaseUrl}/live-game-sessions`, {
      auth: { token: input.token },
      transports: ["websocket"],
      reconnection: true,
    });
    this.socket = socket;
    let connectedBefore = false;
    let resyncPending = false;
    /**
     * The server asked this socket to reconnect (presence recovery).
     *
     * A Socket.IO v4 client never reconnects by itself after a disconnect the
     * *server* initiated ("io server disconnect"), and every other server-side
     * refusal (bad token, revoked credential) must stay final. So recovery is
     * explicit: only a disconnect that follows the server's own recovery
     * request is turned back into a connection.
     */
    let recoveryRequested = false;
    let closed = false;
    this.closeCurrent = () => {
      closed = true;
    };
    // The same controlled path the server's presence recovery uses: drop this
    // connection and open a new one, which re-subscribes and refetches state.
    this.replaceConnection = () => {
      if (closed || recoveryRequested) return;
      recoveryRequested = true;
      socket.disconnect();
    };
    const recoveries: number[] = [];
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
    /**
     * A request is only "in flight" until it is answered *or* times out.
     *
     * Without the timeout this flag was a one-way latch. The server answers a
     * failed `request-snapshot` with `live-session:error` and no snapshot, and a
     * backgrounded phone can lose the reply frame outright — after either, every
     * later announcement was folded into `requestAgain` and dropped, because
     * that flag is drained only by the snapshot handler that never ran again.
     * A real iPhone then sat on "نجهّز التحدي…" for the rest of the match while
     * its socket stayed connected, and only a reload could clear it.
     */
    let resyncTimer: ReturnType<typeof setTimeout> | undefined;
    const settleResync = () => {
      resyncPending = false;
      if (resyncTimer !== undefined) {
        clearTimeout(resyncTimer);
        resyncTimer = undefined;
      }
      if (requestAgain) {
        requestAgain = false;
        recoverSnapshot();
      }
    };
    socket.on("connect", () => {
      recoveryRequested = false;
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
      this.connectionCount += 1;
      this.connectionWaiters.forEach((notify) => notify());
    });
    socket.io.on("reconnect_attempt", () => input.onConnection("reconnecting"));
    socket.on("disconnect", (reason?: string) => {
      resyncPending = false;
      requestAgain = false;
      if (resyncTimer !== undefined) {
        clearTimeout(resyncTimer);
        resyncTimer = undefined;
      }
      if (recoveryRequested && !closed) {
        // Our own recovery disconnect, or the server's fallback drop after it:
        // reconnect now. A new connection re-subscribes, restores the snapshot
        // and re-acknowledges readiness under a new connection epoch.
        input.onConnection("reconnecting");
        if (
          reason === "io server disconnect" ||
          reason === "io client disconnect"
        ) {
          socket.connect();
        }
        return;
      }
      input.onConnection("disconnected");
    });
    socket.on(
      "live-session:presence-recovery",
      (payload: { sessionId?: string } | undefined) => {
        if (payload?.sessionId !== input.sessionId || recoveryRequested) return;
        const now = Date.now();
        while (
          recoveries.length &&
          now - recoveries[0] > PRESENCE_RECOVERY_WINDOW_MS
        ) {
          recoveries.shift();
        }
        if (recoveries.length >= MAX_PRESENCE_RECOVERIES) return;
        recoveries.push(now);
        recoveryRequested = true;
        socket.disconnect();
      },
    );
    socket.on("connect_error", (error) => {
      input.onConnection("error");
      input.onError({ code: "CONNECTION_ERROR", message: error.message });
    });
    socket.on("live-session:error", (error: LiveSessionError) => {
      // The server answers a failed `request-snapshot` this way and sends no
      // snapshot, so this is the reply: settle, and honour anything owed.
      input.onError(error);
      settleResync();
    });
    socket.on("live-session:snapshot", (snapshot: LiveSessionSnapshot) => {
      const next = revisionsOf(snapshot);
      // A reply that lost a race must not roll the game backwards.
      if (!isRegression(next, adopted)) {
        adopted = { ...adopted, ...next };
        this.latest = snapshot;
        this.snapshotCount += 1;
        input.onSnapshot(snapshot);
        this.snapshotWaiters.forEach((notify) => notify());
      }
      // Settled after adopting, so an owed re-request carries what we now hold.
      settleResync();
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
      resyncTimer = setTimeout(settleResync, RESYNC_REPLY_TIMEOUT_MS);
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
  presentationReady(
    input: {
      sessionId: string;
      expectedSessionRevision: number;
      expectedRuntimeRevision: number;
      commandId: string;
      presentationGeneration?: number;
      presentationOutcome?: "media-unavailable" | "autoplay-blocked" | "retry";
    },
    retryWithFreshRevisions?: () => Record<string, unknown> | undefined,
  ): void {
    if (!this.socket?.connected) {
      throw new Error("Live session connection is not available");
    }
    const emit = (command: Record<string, unknown>, attempt = 0): void => {
      if (!this.socket?.connected) return;
      this.socket.emit(
        "live-session:presentation-ready",
        command,
        (ack: unknown) => {
          if (!isStaleRevisionAck(ack) || !retryWithFreshRevisions) return;
          // Multiple real surfaces commonly decode the same presentation at
          // once. Retry only a stale revision, after refreshing the authoritative
          // snapshot, so the acknowledgement race cannot leave a phone stuck in
          // the Fair-Start gate. A changed generation/phase is deliberately not
          // retried: that is a real lifecycle decision, not a transient race.
          if (attempt >= MAX_PRESENTATION_RETRIES) return;
          this.recoverSnapshot?.();
          window.setTimeout(
            () => {
              const refreshed = retryWithFreshRevisions();
              if (!refreshed || !this.socket?.connected) return;
              emit(
                {
                  ...command,
                  ...refreshed,
                  commandId: crypto.randomUUID(),
                  clientTimestamp: new Date().toISOString(),
                },
                attempt + 1,
              );
            },
            RETRY_DELAY_MS * (attempt + 1),
          );
        },
      );
    };
    emit({
      sessionId: input.sessionId,
      expectedSessionRevision: input.expectedSessionRevision,
      expectedRuntimeRevision: input.expectedRuntimeRevision,
      commandId: input.commandId,
      clientTimestamp: new Date().toISOString(),
      ...(input.presentationGeneration !== undefined
        ? { presentationGeneration: input.presentationGeneration }
        : {}),
      ...(input.presentationOutcome
        ? { presentationOutcome: input.presentationOutcome }
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
     * Rebuilds the command against the newest authoritative snapshot.
     *
     * Two players answering a blind mechanic at the same moment is the normal
     * case, not a race to be avoided: whoever arrives second carries the
     * revision from before the first one landed, and the server rightly refuses
     * it. Without this the second player's press is simply lost, and the round
     * waits forever for a submission that was already made.
     */
    retryWithFreshRevisions?: CommandRetryBuilder,
    /**
     * Told once what became of the command. Supplying it also arms the
     * acknowledgement timeout, so a command that is never answered resolves as
     * `unknown` instead of leaving its caller waiting forever.
     */
    onOutcome?: (outcome: CommandOutcome) => void,
  ): void {
    if (!this.socket?.connected) {
      throw new Error("Live session connection is not available");
    }
    if (!retryWithFreshRevisions) {
      this.socket.emit(event, command);
      return;
    }
    this.sendTracked(event, command, retryWithFreshRevisions, onOutcome, 1);
  }

  /**
   * Sends one command and follows it to an outcome.
   *
   * Three things can happen to a send, and each is answered differently:
   *  - **The server answered.** Accepted or refused on its merits, that is the
   *    outcome. A stale-revision refusal is still an answer: the command is
   *    rebuilt only against state the server sent *after* refusing it, and if
   *    that never comes, or keeps going stale, the player is told it was
   *    refused — never that nothing came back.
   *  - **Nothing came back.** The connection is probed before anything else is
   *    sent. If the probe is answered the server was merely slow, and the same
   *    command goes again on the same connection once fresh state is in hand.
   *    If it is not, the connection is dead: it is replaced, the new one must
   *    deliver authoritative state, and only then — if the command still
   *    applies — is it sent again.
   *  - Every resend carries the **same command id**, so a command that did land
   *    before its acknowledgement was lost replays as a duplicate the server
   *    has already applied: no second answer, no second handoff, no second
   *    score. And every resend first asks the caller whether the command still
   *    applies to the newest state — a passed turn, a new question or a spent
   *    clock ends it as `superseded`.
   */
  private sendTracked(
    event: string,
    payload: Record<string, unknown>,
    retry: CommandRetryBuilder,
    onOutcome: ((outcome: CommandOutcome) => void) | undefined,
    attempt: number,
  ): void {
    const socket = this.socket;
    if (!socket?.connected) {
      onOutcome?.({ status: "unknown" });
      return;
    }
    let settled = false;
    const timer = onOutcome
      ? window.setTimeout(() => {
          if (settled) return;
          settled = true;
          void this.recoverFromSilence(
            event,
            payload,
            retry,
            onOutcome,
            attempt,
          );
        }, COMMAND_ACK_TIMEOUT_MS)
      : undefined;
    socket.emit(event, payload, (ack: unknown) => {
      // An answer that arrives after this send was given up on is ignored: any
      // resend carries the same command id and gets its own answer.
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      const code =
        ack && typeof ack === "object"
          ? (ack as { code?: unknown }).code
          : undefined;
      const message =
        ack && typeof ack === "object"
          ? String((ack as { message?: unknown }).message ?? "")
          : "";
      if (isStaleRevisionAck(ack)) {
        void this.retryAgainstNewerState(
          event,
          payload,
          retry,
          onOutcome,
          attempt,
          { code: String(code), message },
        );
        return;
      }
      if (typeof code === "string") {
        onOutcome?.({ status: "rejected", code, message });
        return;
      }
      const runtimeRevision =
        ack && typeof ack === "object"
          ? (ack as { runtimeRevision?: unknown }).runtimeRevision
          : undefined;
      onOutcome?.({
        status: "accepted",
        ...(typeof runtimeRevision === "number" ? { runtimeRevision } : {}),
      });
    });
  }

  /** The server refused a stale command: retry only against newer state. */
  private async retryAgainstNewerState(
    event: string,
    payload: Record<string, unknown>,
    retry: CommandRetryBuilder,
    onOutcome: ((outcome: CommandOutcome) => void) | undefined,
    attempt: number,
    refusal: { code: string; message: string },
  ): Promise<void> {
    const refused = () =>
      onOutcome?.({
        status: "rejected",
        code: refusal.code,
        message: refusal.message,
      });
    if (attempt >= MAX_COMMAND_ATTEMPTS) {
      refused();
      return;
    }
    // Newer in a dimension the command actually carried; a command that
    // carried neither waits for any snapshot after the refusal.
    const sentSession = payload.expectedSessionRevision;
    const sentRuntime = payload.expectedRuntimeRevision;
    const snapshotsAtRefusal = this.snapshotCount;
    const newer = (snapshot: LiveSessionSnapshot) => {
      const session = typeof sentSession === "number" ? sentSession : undefined;
      const runtime = typeof sentRuntime === "number" ? sentRuntime : undefined;
      if (session === undefined && runtime === undefined) {
        return this.snapshotCount > snapshotsAtRefusal;
      }
      return (
        (session !== undefined && snapshot.revision > session) ||
        (runtime !== undefined && (snapshot.gameplay?.revision ?? -1) > runtime)
      );
    };
    if (!this.latest || !newer(this.latest)) this.recoverSnapshot?.();
    const fresh = await this.waitForSnapshot(newer, SNAPSHOT_WAIT_MS);
    if (!fresh) {
      refused();
      return;
    }
    this.resendAgainst(fresh, event, payload, retry, onOutcome, attempt);
  }

  /** Nothing came back: find out whether the connection is alive first. */
  private async recoverFromSilence(
    event: string,
    payload: Record<string, unknown>,
    retry: CommandRetryBuilder,
    onOutcome: (outcome: CommandOutcome) => void,
    attempt: number,
  ): Promise<void> {
    if (attempt >= MAX_COMMAND_ATTEMPTS) {
      onOutcome({ status: "unknown" });
      return;
    }
    const snapshotsBefore = this.snapshotCount;
    if (await this.probe()) {
      // Alive, so the server was slow or the reply was lost. Refresh, then
      // send the same command again on this connection.
      this.recoverSnapshot?.();
      const fresh =
        (await this.waitForSnapshotAfter(snapshotsBefore, SNAPSHOT_WAIT_MS)) ??
        this.latest;
      this.resendAgainst(fresh, event, payload, retry, onOutcome, attempt);
      return;
    }
    // Dead. Replace it, and act only on state the new connection delivers.
    const connectionsBefore = this.connectionCount;
    this.replaceConnection?.();
    const reconnected = await this.waitForConnectionAfter(
      connectionsBefore,
      RECONNECT_WAIT_MS,
    );
    const fresh = reconnected
      ? await this.waitForSnapshotAfter(snapshotsBefore, SNAPSHOT_WAIT_MS)
      : undefined;
    if (!fresh) {
      onOutcome({ status: "unknown" });
      return;
    }
    this.resendAgainst(fresh, event, payload, retry, onOutcome, attempt);
  }

  private resendAgainst(
    fresh: LiveSessionSnapshot | undefined,
    event: string,
    payload: Record<string, unknown>,
    retry: CommandRetryBuilder,
    onOutcome: ((outcome: CommandOutcome) => void) | undefined,
    attempt: number,
  ): void {
    const refreshed = retry(fresh);
    if (!refreshed) {
      onOutcome?.({ status: "superseded" });
      return;
    }
    this.sendTracked(
      event,
      { ...payload, ...refreshed },
      retry,
      onOutcome,
      attempt + 1,
    );
  }

  /**
   * Checks the connection after the phone comes back (a visible tab, a network
   * restored) and replaces it if it no longer carries anything. A healthy
   * connection is left exactly as it is.
   */
  checkConnection(): void {
    if (this.checking || !this.socket?.connected) return;
    this.checking = true;
    void this.probe().then((alive) => {
      this.checking = false;
      if (!alive) this.replaceConnection?.();
    });
  }

  /** True when the server answers the existing heartbeat in time. */
  private probe(): Promise<boolean> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = window.setTimeout(
        () => resolve(false),
        LIVENESS_PROBE_TIMEOUT_MS,
      );
      // Any answer — even a refusal — proves the connection carries frames.
      socket.emit(
        "live-session:participant-heartbeat",
        { sessionId: this.sessionId },
        () => {
          window.clearTimeout(timer);
          resolve(true);
        },
      );
    });
  }

  private waitForSnapshot(
    accept: (snapshot: LiveSessionSnapshot) => boolean,
    timeoutMs: number,
  ): Promise<LiveSessionSnapshot | undefined> {
    if (this.latest && accept(this.latest)) return Promise.resolve(this.latest);
    return this.waitUntil(
      this.snapshotWaiters,
      () => (this.latest && accept(this.latest) ? this.latest : undefined),
      timeoutMs,
    );
  }

  private waitForSnapshotAfter(
    count: number,
    timeoutMs: number,
  ): Promise<LiveSessionSnapshot | undefined> {
    return this.waitForSnapshot(() => this.snapshotCount > count, timeoutMs);
  }

  private waitForConnectionAfter(
    count: number,
    timeoutMs: number,
  ): Promise<boolean> {
    if (this.connectionCount > count) return Promise.resolve(true);
    return this.waitUntil(
      this.connectionWaiters,
      () => (this.connectionCount > count ? true : undefined),
      timeoutMs,
    ).then(Boolean);
  }

  private waitUntil<T>(
    waiters: Set<() => void>,
    ready: () => T | undefined,
    timeoutMs: number,
  ): Promise<T | undefined> {
    return new Promise((resolve) => {
      const check = () => {
        const value = ready();
        if (value === undefined) return;
        window.clearTimeout(timer);
        waiters.delete(check);
        resolve(value);
      };
      const timer = window.setTimeout(() => {
        waiters.delete(check);
        resolve(undefined);
      }, timeoutMs);
      waiters.add(check);
    });
  }

  disconnect(): void {
    this.closeCurrent?.();
    this.closeCurrent = undefined;
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.socket?.disconnect();
    this.socket = undefined;
    this.recoverSnapshot = undefined;
    this.replaceConnection = undefined;
    this.latest = undefined;
  }
}
