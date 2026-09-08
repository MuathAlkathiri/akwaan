import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A phone that comes back to the foreground must not come back stale.
 *
 * iOS Safari freezes a backgrounded tab and can restore it from its
 * back/forward cache without the page ever reporting itself hidden, so a device
 * that was away while the match moved on holds whatever it had. Both resume
 * events go through the one canonical snapshot request every other recovery
 * uses — there is no Marhala-specific socket path here, and no reload.
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

async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <LiveSessionProvider sessionId="session-1">
        <span />
      </LiveSessionProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  socket.requestSnapshot.mockClear();
  return view;
}

describe("a resumed session revalidates itself", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    socket.requestSnapshot.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks for the current snapshot when the phone is foregrounded", async () => {
    const view = await mount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(socket.requestSnapshot).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("does not ask while the phone is still hidden", async () => {
    const view = await mount();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(socket.requestSnapshot).not.toHaveBeenCalled();
    view.unmount();
  });

  it("asks when Safari restores the page from its cache", async () => {
    // `pageshow` is the only event that fires for a back/forward-cache restore;
    // the page was never hidden, so visibility alone would miss it.
    const view = await mount();

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });

    expect(socket.requestSnapshot).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("asks for nothing once the session is torn down", async () => {
    // Not a claim about listener bookkeeping — a resume event after teardown
    // must reach no socket, which is what keeps a closed session from
    // resurrecting itself on a foreground.
    const view = await mount();
    view.unmount();

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(socket.requestSnapshot).not.toHaveBeenCalled();
  });
});
