import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionSocket } from "@/features/live-game-session/realtime/live-session-socket";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * One authoritative change fans out as several realtime events, and each of
 * them used to cost the server a full snapshot composition — per connected
 * client. The events already name the revisions they refer to, so most of that
 * was provably redundant.
 *
 * These drive the real socket wrapper against a fake socket.io client and count
 * what actually leaves the browser.
 */

type Handler = (payload?: unknown) => void;

function harness() {
  const handlers = new Map<string, Handler[]>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    connected: true,
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    disconnect: vi.fn(),
    io: { on: vi.fn() },
  };
  vi.doMock("socket.io-client", () => ({ io: () => socket }));

  const fire = (event: string, payload?: unknown) => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  const requests = () =>
    emitted.filter((e) => e.event === "live-session:request-snapshot").length;
  return { socket, handlers, emitted, fire, requests };
}

const snapshot = (
  session: number,
  runtime?: number,
  match?: number,
): LiveSessionSnapshot =>
  ({
    sessionId: "session-1",
    revision: session,
    ...(runtime === undefined ? {} : { gameplay: { revision: runtime } }),
    ...(match === undefined ? {} : { match: { revision: match, id: "m1" } }),
  }) as unknown as LiveSessionSnapshot;

describe("realtime revision deduplication", () => {
  let h: ReturnType<typeof harness>;
  let adopted: LiveSessionSnapshot[];

  beforeEach(async () => {
    vi.resetModules();
    h = harness();
    adopted = [];
    const { LiveSessionSocket: Socket } = await import(
      "@/features/live-game-session/realtime/live-session-socket"
    );
    const client = new Socket();
    client.connect({
      sessionId: "session-1",
      token: "t",
      onSnapshot: (s) => adopted.push(s),
      onConnection: () => {},
      onError: () => {},
    });
    h.fire("connect");
    // Hydrate: the client now holds session 5, runtime 12, match 9.
    h.fire("live-session:snapshot", snapshot(5, 12, 9));
    h.emitted.length = 0;
  });

  it("ignores an event describing a revision already on screen", async () => {
    h.fire("live-session:round-changed", {
      runtimeId: "r1",
      runtimeRevision: 12,
      sessionRevision: 5,
    });

    expect(h.requests()).toBe(0);
  });

  it("collapses several events naming one revision into a single request", async () => {
    // A resolved item publishes an interaction change, a round change and a
    // Match change. One authoritative revision, so one fetch.
    const payload = { runtimeId: "r1", runtimeRevision: 13, sessionRevision: 5 };
    h.fire("live-session:interaction-changed", payload);
    h.fire("live-session:round-changed", payload);
    h.fire("live-session:interaction-resolved", payload);
    h.fire("live-session:submission-received", payload);
    h.fire("live-session:round-completed", payload);

    expect(h.requests()).toBe(1);
  });

  it("fetches again for a revision that arrived while a request was out", async () => {
    // The reply in flight was composed before 14 existed, so adopting it and
    // stopping would leave the client a revision behind indefinitely.
    h.fire("live-session:round-changed", { runtimeRevision: 13 });
    expect(h.requests()).toBe(1);

    h.fire("live-session:round-changed", { runtimeRevision: 14 });
    expect(h.requests()).toBe(1); // not stacked

    h.fire("live-session:snapshot", snapshot(5, 13, 9));
    expect(h.requests()).toBe(2); // owed request issued on settle
  });

  it("does not refetch for an event that lands after a newer snapshot", async () => {
    h.fire("live-session:snapshot", snapshot(6, 14, 9));
    h.emitted.length = 0;

    h.fire("live-session:round-changed", {
      runtimeRevision: 12,
      sessionRevision: 5,
    });

    expect(h.requests()).toBe(0);
  });

  it("refuses a reply that would roll the game backwards", async () => {
    h.fire("live-session:snapshot", snapshot(7, 15, 9));
    const before = adopted.length;

    // A slower reply for an older revision lands second.
    h.fire("live-session:snapshot", snapshot(6, 14, 9));

    expect(adopted.length).toBe(before);
    expect(adopted.at(-1)!.revision).toBe(7);
  });

  it("still adopts a snapshot that only changed presence", async () => {
    // Presence is merged at read time and bumps no counter, so this snapshot
    // carries exactly the revisions already held. Refusing it would freeze the
    // lobby's connection indicators.
    h.fire("live-session:snapshot", snapshot(5, 12, 9));

    expect(adopted.at(-1)!.revision).toBe(5);
    expect(adopted.length).toBeGreaterThan(1);
  });

  it("always refetches for an event that names no revision", async () => {
    h.fire("live-session:participant-presence-changed", {
      participantId: "p1",
      presence: "connected",
    });

    expect(h.requests()).toBe(1);
  });

  it("refetches when the Match moved even though the session did not", async () => {
    // Match reconciliation bumps only the Match. Comparing against the session
    // counter alone would suppress a real board change.
    h.fire("live-session:match-changed", {
      matchId: "m1",
      matchRevision: 10,
      stage: "board",
      status: "active",
      reason: "challenge-completed",
    });

    expect(h.requests()).toBe(1);
  });

  it("refetches when the runtime moved even though the session did not", async () => {
    h.fire("live-session:round-changed", {
      runtimeRevision: 13,
      sessionRevision: 5,
    });

    expect(h.requests()).toBe(1);
  });
});

describe("realtime request volume per authoritative revision", () => {
  /**
   * The headline number. One gameplay transition publishes a burst of events;
   * this counts the snapshot requests a single client makes for it, before and
   * after suppression. Multiply by connected clients for the server-side total.
   */
  const burst = [
    { event: "live-session:interaction-changed", rev: 13 },
    { event: "live-session:round-changed", rev: 13 },
    { event: "live-session:interaction-resolved", rev: 13 },
    { event: "live-session:submission-changed", rev: 13 },
    { event: "live-session:round-changed", rev: 13 },
  ];

  it.each([2, 4, 8])(
    "issues one request per client for %i clients, not one per event",
    async (clients) => {
      let total = 0;
      for (let client = 0; client < clients; client += 1) {
        vi.resetModules();
        const h = harness();
        const { LiveSessionSocket: Socket } = await import(
          "@/features/live-game-session/realtime/live-session-socket"
        );
        new Socket().connect({
          sessionId: "session-1",
          token: "t",
          onSnapshot: () => {},
          onConnection: () => {},
          onError: () => {},
        });
        h.fire("connect");
        h.fire("live-session:snapshot", snapshot(5, 12, 9));
        h.emitted.length = 0;

        for (const step of burst) {
          h.fire(step.event, { runtimeRevision: step.rev, sessionRevision: 5 });
        }
        total += h.requests();
      }

      // Was `clients * burst.length`; now one per client for the one revision.
      expect(total).toBe(clients);
    },
  );
});

describe("LiveSessionSocket module surface", () => {
  it("still exposes the manual resync used by reconnect and visibility", () => {
    expect(typeof new LiveSessionSocket().requestSnapshot).toBe("function");
  });
});
