import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const socketHarness = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Handler>();
  const managerHandlers = new Map<string, Handler>();
  const socket = {
    connected: true,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() },
  };
  socket.on.mockImplementation((event: string, handler: Handler) => {
      handlers.set(event, handler);
      return socket;
  });
  socket.io.on.mockImplementation((event: string, handler: Handler) => {
    managerHandlers.set(event, handler);
  });
  return { handlers, managerHandlers, socket, io: vi.fn(() => socket) };
});

vi.mock("socket.io-client", () => ({ io: socketHarness.io }));

import { LiveSessionSocket } from "./realtime/live-session-socket";

describe("Match socket synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    socketHarness.handlers.clear();
    socketHarness.managerHandlers.clear();
    socketHarness.io.mockImplementation(() => socketHarness.socket);
    socketHarness.socket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      socketHarness.handlers.set(event, handler);
      return socketHarness.socket;
    });
    socketHarness.socket.io.on.mockImplementation(
      (event: string, handler: (...args: unknown[]) => void) => {
        socketHarness.managerHandlers.set(event, handler);
      },
    );
    socketHarness.socket.emit.mockClear();
    socketHarness.socket.on.mockClear();
    socketHarness.socket.disconnect.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores an older Match event and coalesces authoritative resync requests", () => {
    const client = new LiveSessionSocket();
    const onResyncing = vi.fn();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
      onResyncing,
      shouldRecoverMatch: (event) => event.matchRevision > 5,
    });
    socketHarness.handlers.get("connect")?.();
    const changed = socketHarness.handlers.get("live-session:match-changed")!;
    changed({ matchId: "match-1", matchRevision: 4 });
    expect(
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ),
    ).toHaveLength(0);
    changed({ matchId: "match-1", matchRevision: 6 });
    changed({ matchId: "match-1", matchRevision: 7 });
    expect(
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ),
    ).toHaveLength(1);
    expect(onResyncing).toHaveBeenCalledTimes(1);
  });

  it("keeps resyncing after a snapshot request the server answered with an error", () => {
    // The real iPhone Safari stall. A snapshot request that produces no
    // `live-session:snapshot` reply — the server's `respond()` emits
    // `live-session:error` and returns on any failure — used to latch the
    // in-flight guard forever: every later announcement was converted into
    // "one is owed" and dropped, because the owed flag is only drained inside
    // the snapshot handler that never ran again. The phone then sat on
    // "نجهّز التحدي…" through every following question until it was reloaded.
    const client = new LiveSessionSocket();
    const onSnapshot = vi.fn();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot,
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    const requests = () =>
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ).length;

    // Q1 → Q2: the runtime advances and the phone asks for the new snapshot.
    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 8,
    });
    expect(requests()).toBe(1);

    // The server fails that request and says so instead of sending a snapshot.
    socketHarness.handlers.get("live-session:error")?.({
      code: "LIVE_SESSION_ERROR",
      message: "snapshot failed",
    });

    // Q2 → Q3, on the same live socket. The phone must ask again.
    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 9,
    });
    expect(requests()).toBe(2);

    // And the reply is adopted, so the phone is no longer stale.
    socketHarness.handlers.get("live-session:snapshot")?.({
      sessionId: "session-1",
      revision: 4,
      gameplay: { revision: 9 },
    });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("honours a revision announced while a request was already in flight", () => {
    // The reply in flight was composed before that change existed, so adopting
    // it and stopping would leave the phone one generation behind with nothing
    // left to wake it.
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    const requests = () =>
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ).length;

    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 8,
    });
    expect(requests()).toBe(1);

    // Q3 is announced before the Q2 reply lands.
    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 9,
    });
    expect(requests()).toBe(1);

    // The stale reply arrives; the owed request must go out with it.
    socketHarness.handlers.get("live-session:snapshot")?.({
      sessionId: "session-1",
      revision: 4,
      gameplay: { revision: 8 },
    });
    expect(requests()).toBe(2);
  });

  it("does not wedge when a snapshot request is never answered at all", () => {
    // Same latch, reached without an error event: a request that simply never
    // comes back (a dropped frame on a backgrounded phone) must not silence
    // every future recovery either.
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    const requests = () =>
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ).length;

    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 8,
    });
    expect(requests()).toBe(1);

    // No reply. After the bounded wait the channel is usable again.
    vi.advanceTimersByTime(6_000);
    socketHarness.handlers.get("live-session:runtime-changed")?.({
      runtimeRevision: 9,
    });
    expect(requests()).toBe(2);
  });

  it("resyncs when a phone's presence changes, which is what a preflight waits on", () => {
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    socketHarness.socket.emit.mockClear();

    socketHarness.handlers.get("live-session:participant-presence-changed")?.({
      participantId: "participant-1",
      presence: "connected",
    });

    // Readiness and the Start button are computed from presence, so ignoring
    // this event leaves the host on a stale "not ready" until it reloads.
    expect(
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ),
    ).toHaveLength(1);
  });

  it("resends a submission the server refused as stale, with fresh revisions", () => {
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    socketHarness.socket.emit.mockClear();

    // Two players answering at once: whoever lands second carries the revision
    // from before the first one applied, and the server refuses it.
    client.command(
      "live-session:interaction-submit",
      {
        sessionId: "session-1",
        commandId: "command-1",
        clientTimestamp: "2026-08-07T00:00:00.000Z",
        expectedRuntimeRevision: 6,
      },
      () => ({ expectedRuntimeRevision: 7 }),
    );

    const [, , ack] = socketHarness.socket.emit.mock.calls.at(-1)!;
    (ack as (value: unknown) => void)({
      code: "STALE_RUNTIME_REVISION",
      message: "Expected gameplay runtime revision 6, but current revision is 7",
    });
    vi.advanceTimersByTime(500);

    const resent = socketHarness.socket.emit.mock.calls.filter(
      ([event]) => event === "live-session:interaction-submit",
    );
    expect(resent).toHaveLength(2);
    // Same command id, so a submission that did land is refused as a duplicate.
    expect(resent[1][1]).toMatchObject({
      commandId: "command-1",
      expectedRuntimeRevision: 7,
    });
    // And it asked the server for the truth before resending.
    expect(
      socketHarness.socket.emit.mock.calls.some(
        ([event]) => event === "live-session:request-snapshot",
      ),
    ).toBe(true);
  });

  it("does not resend a command the server refused on its merits", () => {
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot: vi.fn(),
      onConnection: vi.fn(),
      onError: vi.fn(),
    });
    socketHarness.handlers.get("connect")?.();
    socketHarness.socket.emit.mockClear();
    const retry = vi.fn(() => ({ expectedRuntimeRevision: 7 }));

    client.command(
      "live-session:interaction-submit",
      {
        sessionId: "session-1",
        commandId: "command-2",
        clientTimestamp: "2026-08-07T00:00:00.000Z",
      },
      retry,
    );
    const [, , ack] = socketHarness.socket.emit.mock.calls.at(-1)!;
    (ack as (value: unknown) => void)({ code: "RYO_WRONG_SIDE" });
    vi.advanceTimersByTime(500);

    expect(retry).not.toHaveBeenCalled();
    expect(
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:interaction-submit",
      ),
    ).toHaveLength(1);
  });

  it("adopts a snapshot, then requests another authoritative snapshot on reconnect", () => {
    const onSnapshot = vi.fn();
    const client = new LiveSessionSocket();
    client.connect({
      sessionId: "session-1",
      token: "token",
      onSnapshot,
      onConnection: vi.fn(),
      onError: vi.fn(),
      shouldRecoverMatch: () => true,
    });
    const connect = socketHarness.handlers.get("connect")!;
    connect();
    socketHarness.handlers.get("live-session:match-changed")?.({
      matchId: "match-1",
      matchRevision: 2,
    });
    socketHarness.handlers.get("live-session:snapshot")?.({ sessionId: "session-1" });
    expect(onSnapshot).toHaveBeenCalledWith({ sessionId: "session-1" });
    connect();
    expect(
      socketHarness.socket.emit.mock.calls.filter(
        ([event]) => event === "live-session:request-snapshot",
      ),
    ).toHaveLength(2);
  });
});
