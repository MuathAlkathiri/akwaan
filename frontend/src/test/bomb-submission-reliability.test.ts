import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bomb answer submission reliability (audit 2026-11-16, F1–F3).
 *
 * A player who types an answer must either have it reach the server, or be told
 * plainly that it did not — never wait on a dead connection while the team's
 * clock runs out, never be shown "no reply" for an answer the server refused,
 * and never be locked out by the phone's own clock. Every scenario here drives
 * the real `LiveSessionSocket` against a scripted Socket.IO stand-in.
 */
type Handler = (...args: unknown[]) => void;
type Ack = (reply: unknown) => void;

const io = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const sent: Array<{
    event: string;
    payload: Record<string, unknown>;
    ack?: Ack;
  }> = [];
  const socket = {
    connected: true,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    io: { on: vi.fn() },
  };
  return { handlers, sent, socket, io: vi.fn(() => socket) };
});
vi.mock("socket.io-client", () => ({ io: io.io }));

import {
  LiveSessionSocket,
  type CommandOutcome,
} from "@/features/live-game-session/realtime/live-session-socket";
import { deriveRemainingMs } from "@/features/live-game-session/hooks/use-team-clock-display";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

const ANSWER = "live-session:gameplay-command";
const HEARTBEAT = "live-session:participant-heartbeat";

/** Server behaviour, per event. Undefined = the frame is lost. */
let server: Record<
  string,
  ((payload: Record<string, unknown>) => unknown) | undefined
> = {};

beforeEach(() => {
  vi.useFakeTimers();
  io.handlers.clear();
  io.sent.length = 0;
  server = {};
  io.socket.connected = true;
  io.socket.on.mockImplementation((event: string, handler: Handler) => {
    io.handlers.set(event, handler);
    return io.socket;
  });
  io.socket.io.on.mockImplementation(() => undefined);
  io.socket.emit.mockImplementation(
    (event: string, payload: Record<string, unknown>, ack?: Ack) => {
      io.sent.push({ event, payload, ...(ack ? { ack } : {}) });
      const reply = server[event];
      if (reply && ack) {
        const value = reply(payload);
        if (value !== undefined) setTimeout(() => ack(value), 50);
      }
      return true;
    },
  );
  io.socket.disconnect.mockImplementation(() => {
    io.socket.connected = false;
    io.handlers.get("disconnect")?.("io client disconnect");
  });
  io.socket.connect.mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

const snapshot = (
  session: number,
  runtime: number,
  overrides: Record<string, unknown> = {},
) =>
  ({
    sessionId: "s",
    revision: session,
    status: "active",
    serverTimestamp: new Date().toISOString(),
    gameplay: {
      revision: runtime,
      availableActions: ["mode:submit-answer"],
      activeRound: {
        id: "round-1",
        modeState: { phase: "presenting", itemIndex: 0 },
      },
      ...overrides,
    },
  }) as unknown as LiveSessionSnapshot;

const connected = () => {
  const client = new LiveSessionSocket();
  client.connect({
    sessionId: "s",
    token: "t",
    onSnapshot: vi.fn(),
    onConnection: vi.fn(),
    onError: vi.fn(),
    participant: true,
  });
  io.handlers.get("connect")?.();
  return client;
};
const deliver = (s: LiveSessionSnapshot) =>
  io.handlers.get("live-session:snapshot")?.(s);
const answers = () => io.sent.filter((frame) => frame.event === ANSWER);

/** Send one Bomb answer the way the provider does, recording its outcome. */
function sendAnswer(
  client: LiveSessionSocket,
  revisions = { session: 5, runtime: 9 },
) {
  const outcomes: CommandOutcome[] = [];
  const retries: Array<LiveSessionSnapshot | undefined> = [];
  client.command(
    ANSWER,
    {
      sessionId: "s",
      commandId: "answer-1",
      clientTimestamp: new Date().toISOString(),
      roundId: "round-1",
      commandType: "submit-answer",
      payload: { answer: "ميسي" },
      expectedSessionRevision: revisions.session,
      expectedRuntimeRevision: revisions.runtime,
    },
    (latest?: LiveSessionSnapshot) => {
      retries.push(latest);
      if (!latest?.gameplay) return undefined;
      const active = latest.gameplay.activeRound;
      // The Bomb panel's own rule: same question, still presenting, still mine.
      if (
        active?.id !== "round-1" ||
        active.modeState.phase !== "presenting" ||
        !latest.gameplay.availableActions.includes("mode:submit-answer")
      ) {
        return undefined;
      }
      return {
        expectedSessionRevision: latest.revision,
        expectedRuntimeRevision: latest.gameplay.revision,
      };
    },
    (outcome) => outcomes.push(outcome),
  );
  return { outcomes, retries };
}

// ── F1 — a connection that looks alive but carries nothing ───────────────────

describe("F1 — a dead connection is detected and replaced, not retried into", () => {
  it("probes, reconnects, refreshes, then resends the same command once", async () => {
    const client = connected();
    // Dead transport: nothing the phone sends gets an answer.
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(4_000); // the first answer goes unanswered
    await vi.advanceTimersByTimeAsync(2_500); // and so does the liveness probe
    // The phone did not push the answer through the dead connection again…
    expect(answers()).toHaveLength(1);
    // …it dropped that connection and is opening a new one.
    expect(io.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(io.socket.connect).toHaveBeenCalledTimes(1);

    // The new connection works and the server's state comes back.
    io.socket.connected = true;
    server[ANSWER] = () => ({ runtimeRevision: 10 });
    io.handlers.get("connect")?.();
    deliver(snapshot(5, 9));
    await vi.advanceTimersByTimeAsync(100);

    const resent = answers();
    expect(resent).toHaveLength(2);
    // The same command id: if the first one did land, this is a duplicate.
    expect(resent[1].payload.commandId).toBe("answer-1");
    expect(outcomes).toEqual([{ status: "accepted", runtimeRevision: 10 }]);
  });

  it("resends on the same connection when it is merely slow (the probe answers)", async () => {
    const client = connected();
    server[HEARTBEAT] = () => ({ serverTimestamp: new Date().toISOString() });
    server["live-session:request-snapshot"] = () => undefined;
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(100); // the probe is answered
    expect(io.socket.disconnect).not.toHaveBeenCalled();
    server[ANSWER] = () => ({ runtimeRevision: 10 });
    deliver(snapshot(5, 9));
    await vi.advanceTimersByTimeAsync(200);
    expect(answers()).toHaveLength(2);
    expect(answers()[1].payload.commandId).toBe("answer-1");
    expect(outcomes).toEqual([{ status: "accepted", runtimeRevision: 10 }]);
  });

  it("does not resend once the bomb has moved on during recovery", async () => {
    const client = connected();
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(6_500);
    io.socket.connected = true;
    io.handlers.get("connect")?.();
    // The server handed the bomb to a teammate while this phone was away.
    deliver(snapshot(6, 11, { availableActions: [] }));
    await vi.advanceTimersByTimeAsync(100);
    expect(answers()).toHaveLength(1);
    expect(outcomes).toEqual([{ status: "superseded" }]);
  });

  it("gives the answer back, bounded, when no connection can be made", async () => {
    const client = connected();
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(6_500);
    expect(outcomes).toEqual([]);
    // No reconnect ever succeeds.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcomes).toEqual([{ status: "unknown" }]);
    expect(answers()).toHaveLength(1);
  });

  it("tells the caller at once when the connection is already down", () => {
    const client = connected();
    io.socket.connected = false;
    expect(() => sendAnswer(client)).toThrow();
  });

  it("checks the connection when the phone comes back, and replaces a dead one", async () => {
    const client = connected();
    client.checkConnection();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(io.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(io.socket.connect).toHaveBeenCalledTimes(1);
  });

  it("leaves a healthy connection alone when the phone comes back", async () => {
    const client = connected();
    server[HEARTBEAT] = () => ({ serverTimestamp: new Date().toISOString() });
    client.checkConnection();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(io.socket.disconnect).not.toHaveBeenCalled();
  });
});

// ── F3 — a stale refusal is an answer, and a retry needs newer state ─────────

describe("F3 — stale refusals wait for newer state and are never 'no reply'", () => {
  it("resends only once a newer snapshot has arrived, with its revisions", async () => {
    const client = connected();
    let calls = 0;
    server[ANSWER] = () =>
      ++calls === 1
        ? { code: "STALE_REVISION", message: "x" }
        : { runtimeRevision: 10 };
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(1_000);
    // Refused as stale; the newer snapshot has not arrived, so nothing is resent.
    expect(answers()).toHaveLength(1);
    // A teammate reloaded: the session moved to revision 6.
    deliver(snapshot(6, 9));
    await vi.advanceTimersByTimeAsync(100);
    expect(answers()).toHaveLength(2);
    expect(answers()[1].payload.expectedSessionRevision).toBe(6);
    expect(answers()[1].payload.commandId).toBe("answer-1");
    expect(outcomes).toEqual([{ status: "accepted", runtimeRevision: 10 }]);
  });

  it("reports repeated stale refusals as a refusal, never 'no reply'", async () => {
    const client = connected();
    server[ANSWER] = () => ({ code: "STALE_REVISION", message: "x" });
    const { outcomes } = sendAnswer(client);
    for (let session = 6; session < 9; session += 1) {
      await vi.advanceTimersByTimeAsync(200);
      deliver(snapshot(session, 9));
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      status: "rejected",
      code: "STALE_REVISION",
    });
  });

  it("reports a refusal when no newer state ever arrives", async () => {
    const client = connected();
    server[ANSWER] = () => ({ code: "STALE_REVISION", message: "x" });
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answers()).toHaveLength(1);
    expect(outcomes).toEqual([
      expect.objectContaining({ status: "rejected", code: "STALE_REVISION" }),
    ]);
  });

  it("does not retry an answer whose question changed", async () => {
    const client = connected();
    server[ANSWER] = () => ({ code: "STALE_REVISION", message: "x" });
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(200);
    deliver(
      snapshot(6, 10, {
        activeRound: { id: "round-1", modeState: { phase: "completed" } },
      }),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(answers()).toHaveLength(1);
    expect(outcomes).toEqual([{ status: "superseded" }]);
  });

  it("never retries an authoritative refusal", async () => {
    const client = connected();
    server[ANSWER] = () => ({
      code: "GAMEPLAY_AUTHORIZATION_DENIED",
      message: "x",
    });
    const { outcomes } = sendAnswer(client);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answers()).toHaveLength(1);
    expect(outcomes).toEqual([
      expect.objectContaining({
        status: "rejected",
        code: "GAMEPLAY_AUTHORIZATION_DENIED",
      }),
    ]);
  });
});

// ── F2 — the phone's clock never decides the turn is over ────────────────────

describe("F2 — the countdown follows server time whatever the phone's clock says", () => {
  const clock = {
    allocatedMs: 30_000,
    consumedMs: 0,
    remainingMs: 30_000,
    running: true,
    expired: false,
    startedAt: "2026-11-16T12:00:00.000Z",
  };
  // The server stamped this snapshot five seconds into the turn: 25 s left.
  const stamped = Date.parse("2026-11-16T12:00:05.000Z");
  const remaining = (skewMs: number, elapsedMs = 0) =>
    deriveRemainingMs(
      clock,
      new Date(stamped).toISOString(),
      stamped + skewMs + elapsedMs,
      stamped + skewMs,
    );

  it.each([
    ["61 s fast", 61_000],
    ["61 s slow", -61_000],
    ["an hour fast", 3_600_000],
    ["a day slow", -86_400_000],
    ["in sync", 0],
  ])(
    "shows the server's 25 s when the phone is %s, and counts down",
    (_label, skew) => {
      expect(remaining(skew)).toBe(25_000);
      expect(remaining(skew, 10_000)).toBe(15_000);
      expect(remaining(skew, 30_000)).toBe(0);
    },
  );

  it("stays anchored to server time through a suspended tab and a reconnect", () => {
    // Snapshot stamped at 25 s left, received; the tab is then suspended for
    // 20 s. The phone's clock kept running, so on resume it shows 5 s.
    expect(remaining(61_000, 20_000)).toBe(5_000);
    // A reconnect brings a fresh snapshot: the new stamp re-anchors it.
    const fresh = Date.parse("2026-11-16T12:00:27.000Z"); // 3 s left on the server
    expect(
      deriveRemainingMs(
        { ...clock, remainingMs: 3_000 },
        new Date(fresh).toISOString(),
        fresh + 61_000 + 500,
        fresh + 61_000,
      ),
    ).toBe(2_500);
  });

  it("errs towards more time — never less — when a snapshot arrives late", () => {
    // Stamped at 25 s left but delivered 2 s later: the phone cannot know the
    // delay, so it shows up to 2 s more than the server has. It can never
    // show less, so it can never lock a valid holder out; the server still
    // rules on a late answer.
    const delivered = stamped + 2_000;
    expect(
      deriveRemainingMs(
        clock,
        new Date(stamped).toISOString(),
        delivered,
        delivered,
      ),
    ).toBe(25_000);
  });
});
