import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The clock ticks four times a second for as long as a session is open.
 *
 * It used to sit on the Live Session context value, so each tick produced a new
 * value object and every consumer of that context — boards, scoreboards,
 * mechanic panels, roughly 29 components — was rerendered for a change none of
 * them read. These mount the real provider and count renders on both sides of
 * the new boundary.
 */

const socket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  requestSnapshot: vi.fn(),
  command: vi.fn(),
};

vi.mock("@/features/live-game-session/realtime/live-session-socket", () => ({
  LiveSessionSocket: vi.fn(() => socket),
}));

// Hoisted, because `vi.mock` factories are lifted above ordinary consts.
const initialSnapshot = vi.hoisted(() => ({
  sessionId: "session-1",
  revision: 1,
  serverTimestamp: "2026-08-16T00:00:00.000Z",
  teams: [],
  participants: [],
  availableActions: [],
}));

vi.mock("@/features/live-game-session/api/live-session-api", () => ({
  getLiveSession: () => Promise.resolve(initialSnapshot),
  setMatchDouble: vi.fn(),
}));

vi.mock("@/features/auth/storage/auth-storage", () => ({
  authStorage: { getToken: () => "token" },
}));

import { LiveSessionProvider } from "@/features/live-game-session/components/live-session-provider";
import { useLiveSessionClock } from "@/features/live-game-session/hooks/live-session-clock-context";
import { useLiveSession } from "@/features/live-game-session/hooks/live-session-context";

const renders = { clock: 0, state: 0 };

/** Stands in for a countdown: it draws time, so it must follow the tick. */
function ClockConsumer() {
  const nowMs = useLiveSessionClock();
  renders.clock += 1;
  return <span data-testid="clock">{nowMs}</span>;
}

/** Stands in for the board: gameplay state only, no interest in the clock. */
function StateConsumer() {
  const { connection } = useLiveSession();
  renders.state += 1;
  return <span data-testid="state">{connection}</span>;
}

/**
 * Mounts and lets the initial load settle before anything is counted.
 *
 * The first snapshot legitimately rerenders both consumers; measuring across
 * it would credit the clock with a change it did not cause.
 */
async function mountSettled() {
  renders.clock = 0;
  renders.state = 0;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <LiveSessionProvider sessionId="session-1">
        <ClockConsumer />
        <StateConsumer />
      </LiveSessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

/**
 * One tick per act, because React batches every state update inside a single
 * act into one render — four ticks advanced together would look like one.
 */
async function tick(times: number) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
  }
}

describe("live session clock isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Only the socket spies; clearing every mock would strip the module
    // factories above and leave the query resolving to undefined.
    socket.connect.mockClear();
    socket.disconnect.mockClear();
  });

  it("advances the clock consumer on every tick", async () => {
    await mountSettled();
    const before = renders.clock;

    await tick(4);

    // A component that draws time must see each of the four ticks.
    expect(renders.clock).toBe(before + 4);
  });

  it("does not rerender a gameplay consumer when only the clock ticks", async () => {
    // The whole point of the split. This assertion is what fails if `nowMs`
    // ever returns to the shared context value.
    await mountSettled();
    const before = renders.state;

    await tick(4);

    expect(renders.state).toBe(before);
  });

  it("still rerenders the gameplay consumer when the session state changes", async () => {
    // Isolation must not have cut the wire it was supposed to leave alone.
    await mountSettled();
    const before = renders.state;
    const onConnection = socket.connect.mock.calls[0][0].onConnection as (
      state: string,
    ) => void;

    await act(async () => {
      onConnection("reconnecting");
    });

    expect(renders.state).toBeGreaterThan(before);
  });
});
