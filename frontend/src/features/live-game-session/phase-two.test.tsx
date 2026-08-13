import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JoinAccessPanel } from "./components/join-access-panel";
import { PlayerLobby } from "./components/player-lobby";
import { LiveSessionContext } from "./hooks/live-session-context";
import type { LiveSessionSnapshot, ParticipantCredential } from "./model";
import { participantCredentialStorage } from "./storage/participant-credential-storage";

const api = vi.hoisted(() => ({
  getJoinAccess: vi.fn(),
  createJoinAccess: vi.fn(),
  regenerateJoinAccess: vi.fn(),
  revokeJoinAccess: vi.fn(),
}));

vi.mock("./api/live-session-api", async (loadOriginal) => ({
  ...(await loadOriginal<typeof import("./api/live-session-api")>()),
  ...api,
}));

const snapshot: LiveSessionSnapshot = {
  sessionId: "session-1",
  mode: { key: "core-timed-turns", version: 1 },
  status: "waiting",
  revision: 2,
  serverTimestamp: "2026-01-01T00:00:00.000Z",
  round: { number: 1 },
  teams: [
    {
      id: "team-1",
      name: "Purple",
      active: true,
      clock: {
        allocatedMs: 60_000,
        consumedMs: 0,
        remainingMs: 60_000,
        running: false,
        expired: false,
      },
    },
  ],
  participants: [
    {
      id: "player-1",
      displayName: "Player",
      role: "team-player",
      teamId: "team-1",
      ready: false,
      joinedAt: "2026-01-01T00:00:00.000Z",
      connected: true,
      connectedDeviceCount: 1,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      presence: "connected",
    },
  ],
  readiness: {
    canMarkSessionReady: false,
    readyPlayers: 0,
    totalPlayers: 1,
    readyTeamIds: [],
  },
  availableActions: ["participant-ready"],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastTransitionAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("live session phase two frontend", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("stores credentials per join code and removes expired values", () => {
    const credential: ParticipantCredential = {
      sessionId: "session-1",
      participantId: "player-1",
      credential: "scoped-token",
      credentialExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      snapshot,
    };
    participantCredentialStorage.set(" ab2c ", credential);
    expect(participantCredentialStorage.get("AB2C")?.credential).toBe(
      "scoped-token",
    );
    participantCredentialStorage.set("OLD", {
      ...credential,
      credentialExpiresAt: new Date(Date.now() - 1).toISOString(),
    });
    expect(participantCredentialStorage.get("OLD")).toBeUndefined();
  });

  it("delegates readiness using the participant socket action", () => {
    const command = vi.fn();
    render(
      <LiveSessionContext.Provider
        value={{
          snapshot,
          connection: "connected",
          nowMs: Date.now(),
          command,
          gameplayCommand: vi.fn(),
        }}
      >
        <PlayerLobby participantId="player-1" />
      </LiveSessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "I’m ready" }));
    expect(command).toHaveBeenCalledWith("participant-ready");
  });

  it("renders both QR and human-code pairing fallbacks", async () => {
    api.getJoinAccess.mockResolvedValue({
      joinCode: "AB2C345",
      assignmentPolicy: "explicit",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T02:00:00.000Z",
      enabled: true,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <JoinAccessPanel sessionId="session-1" />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("AB2C345")).toBeInTheDocument(),
    );
    expect(screen.getByTitle("Player join QR code")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy join link" }),
    ).toBeEnabled();
  });
});
