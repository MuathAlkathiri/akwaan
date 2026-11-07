import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Server, type Namespace, type Socket } from "socket.io";
import { io as createClient } from "socket.io-client";

/**
 * Presence recovery against a REAL Socket.IO server and the REAL
 * socket.io-client, driving the production `LiveSessionSocket` wrapper.
 *
 * The property under test is Socket.IO v4's: a disconnect initiated by the
 * server ("io server disconnect") is never auto-reconnected by the client, so
 * the server's "please reconnect" must be an explicit protocol, and every other
 * server-side disconnect or refusal must stay final.
 */

let baseUrl = "";
vi.mock("@/config/runtime-config", () => ({
  runtimeConfig: {
    get apiBaseUrl() {
      return baseUrl;
    },
  },
}));

const SESSION = "session-1";

interface Fixture {
  http: HttpServer;
  io: Server;
  ns: Namespace;
  subscriptions: string[];
  sockets: Map<string, Socket>;
}

async function startServer(): Promise<Fixture> {
  const http = createServer();
  const io = new Server(http, { transports: ["websocket"] });
  const ns = io.of("/live-game-sessions");
  const subscriptions: string[] = [];
  const sockets = new Map<string, Socket>();
  ns.use((socket, next) => {
    if (socket.handshake.auth?.token === "valid") next();
    else next(new Error("Unauthorized"));
  });
  ns.on("connection", (socket) => {
    sockets.set(socket.id, socket);
    socket.on("disconnect", () => sockets.delete(socket.id));
    socket.on("live-session:subscribe", (body: { sessionId: string }) => {
      subscriptions.push(socket.id);
      socket.emit("live-session:snapshot", {
        sessionId: body.sessionId,
        revision: subscriptions.length,
      });
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return { http, io, ns, subscriptions, sockets };
}

const waitFor = async (check: () => boolean, timeoutMs = 3_000) => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const settle = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("presence recovery over a real Socket.IO connection", () => {
  let server: Fixture;
  let states: string[];
  let snapshots: Array<{ revision: number }>;
  let errors: Array<{ code: string }>;
  let client: import("@/features/live-game-session/realtime/live-session-socket").LiveSessionSocket;

  beforeEach(async () => {
    server = await startServer();
    states = [];
    snapshots = [];
    errors = [];
    const { LiveSessionSocket } =
      await import("@/features/live-game-session/realtime/live-session-socket");
    client = new LiveSessionSocket();
  });

  afterEach(async () => {
    client.disconnect();
    server.io.close();
    await new Promise((resolve) => server.http.close(resolve));
  });

  const open = (token = "valid") =>
    client.connect({
      sessionId: SESSION,
      token,
      onSnapshot: (s) => snapshots.push(s as unknown as { revision: number }),
      onConnection: (state) => states.push(state),
      onError: (error) => errors.push(error),
    });
  const connectedCount = () => states.filter((s) => s === "connected").length;

  it("confirms the library property: a server disconnect is not auto-reconnected", async () => {
    open();
    await waitFor(() => server.subscriptions.length === 1);
    const [only] = server.sockets.values();
    only.disconnect(true);
    await settle(1_500);
    expect(connectedCount()).toBe(1);
    expect(server.subscriptions).toHaveLength(1);
    expect(states.at(-1)).toBe("disconnected");
  });

  it("reconnects on a recovery request with a new connection, re-subscribes and restores the snapshot", async () => {
    open();
    await waitFor(
      () => server.subscriptions.length === 1 && snapshots.length === 1,
    );
    const firstId = server.subscriptions[0];
    server.sockets.get(firstId)!.emit("live-session:presence-recovery", {
      sessionId: SESSION,
    });
    await waitFor(
      () => server.subscriptions.length === 2 && snapshots.length >= 2,
    );
    expect(server.subscriptions[1]).not.toBe(firstId);
    // Two "connected" transitions = two connection epochs; the provider bumps
    // its epoch on each, which is what re-arms the fair-start readiness ack.
    expect(connectedCount()).toBe(2);
    expect(states).toContain("reconnecting");
    expect(states).not.toContain("disconnected");
    expect(snapshots.at(-1)?.revision).toBe(2);
    expect(server.sockets.has(firstId)).toBe(false);
  });

  it("recovers when the server's fallback drop arrives right after the request", async () => {
    open();
    await waitFor(() => server.subscriptions.length === 1);
    const socket = server.sockets.get(server.subscriptions[0])!;
    socket.emit("live-session:presence-recovery", { sessionId: SESSION });
    socket.disconnect(true);
    await waitFor(() => server.subscriptions.length === 2);
    await settle(300);
    expect(server.subscriptions).toHaveLength(2);
    expect(connectedCount()).toBe(2);
  });

  it("keeps an old client that ignores the recovery event recoverable via the transport fallback", async () => {
    const subscriptions: string[] = [];
    const oldClient = createClient(`${baseUrl}/live-game-sessions`, {
      auth: { token: "valid" },
      transports: ["websocket"],
      reconnection: true,
    });
    oldClient.on("connect", () => {
      oldClient.emit("live-session:subscribe", { sessionId: SESSION });
    });
    server.ns.on("connection", (socket) => {
      socket.on("live-session:subscribe", () => subscriptions.push(socket.id));
    });
    try {
      await waitFor(() => subscriptions.length === 1);
      const firstId = subscriptions[0];
      const socket = server.sockets.get(firstId)!;
      socket.emit("live-session:presence-recovery", { sessionId: SESSION });
      // This is the backend fallback: unlike socket.disconnect(true), closing
      // the transport is a recoverable network loss for the original client.
      socket.client.conn.close();
      await waitFor(() => subscriptions.length === 2);
      expect(subscriptions[1]).not.toBe(firstId);
    } finally {
      oldClient.disconnect();
    }
  });

  it("ignores a recovery request for another session", async () => {
    open();
    await waitFor(() => server.subscriptions.length === 1);
    server.sockets
      .get(server.subscriptions[0])!
      .emit("live-session:presence-recovery", { sessionId: "other" });
    await settle(500);
    expect(server.subscriptions).toHaveLength(1);
    expect(connectedCount()).toBe(1);
  });

  it("keeps an authentication refusal final; recovery never retries it", async () => {
    open("revoked");
    await waitFor(() => errors.length >= 1);
    await settle(1_500);
    expect(errors[0].code).toBe("CONNECTION_ERROR");
    expect(connectedCount()).toBe(0);
    expect(server.subscriptions).toHaveLength(0);
  });

  it("does not resurrect a connection the app closed while a recovery was pending", async () => {
    open();
    await waitFor(() => server.subscriptions.length === 1);
    const socket = server.sockets.get(server.subscriptions[0])!;
    // Tear down from the app side first, then let the server's request land.
    client.disconnect();
    socket.emit("live-session:presence-recovery", { sessionId: SESSION });
    await settle(800);
    expect(server.subscriptions).toHaveLength(1);
    expect(server.sockets.size).toBe(0);
  });

  it("bounds repeated recovery requests", async () => {
    open();
    for (let round = 1; round <= 7; round += 1) {
      await waitFor(() => server.subscriptions.length >= Math.min(round, 6));
      const latest = server.subscriptions.at(-1)!;
      server.sockets
        .get(latest)
        ?.emit("live-session:presence-recovery", { sessionId: SESSION });
      await settle(150);
    }
    await settle(500);
    // One initial connection plus at most five recoveries in the window.
    expect(server.subscriptions.length).toBe(6);
  });
});
