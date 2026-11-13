import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerJoinPage } from "@/features/live-game-session/components/player-join-page";
import { participantCredentialStorage } from "@/features/live-game-session/storage/participant-credential-storage";

const api = vi.hoisted(() => ({
  resolveJoinCode: vi.fn(),
  joinLiveSession: vi.fn(),
  reconnectLiveParticipant: vi.fn(),
}));

vi.mock("@/features/live-game-session/api/live-session-api", async (load) => ({
  ...(await load<
    typeof import("@/features/live-game-session/api/live-session-api")
  >()),
  ...api,
}));

/**
 * What a player does with their phone after scanning.
 *
 * Three decisions, in the order the room needs them: who you are, which
 * character, which side. The character grid and the team nudge are what replace
 * the old team-setup step, so these hold the behaviour that makes that
 * replacement work.
 */
const room = (over: Record<string, unknown> = {}) => ({
  available: true as const,
  mode: { key: "core-timed-turns", version: 1 },
  status: "waiting" as const,
  assignmentPolicy: "explicit" as const,
  teams: [
    { id: "team-blue", name: "الأزرق", colorId: "blue", playerCount: 3 },
    { id: "team-red", name: "الأحمر", colorId: "red", playerCount: 1 },
  ],
  takenAvatarKeys: [] as string[],
  expiresAt: "2026-01-01T01:00:00.000Z",
  ...over,
});

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlayerJoinPage joinCode="YQ6WBTN" />
    </QueryClientProvider>,
  );
}

describe("the player's phone", () => {
  beforeEach(() => {
    participantCredentialStorage.remove("YQ6WBTN");
    api.resolveJoinCode.mockResolvedValue(room());
    api.joinLiveSession.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("picks a character for the player before they touch anything", async () => {
    mount();
    // The common path is a name and a colour: the character is already chosen,
    // so nobody has to care about it.
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "رائد" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
  });

  it("shows all twelve, and the taken ones cannot be chosen", async () => {
    api.resolveJoinCode.mockResolvedValue(
      room({ takenAvatarKeys: ["astronaut", "alien"] }),
    );
    mount();
    await waitFor(() =>
      expect(document.querySelectorAll("[data-character-option]")).toHaveLength(
        12,
      ),
    );
    // Visible but disabled: seeing that someone is already the astronaut is
    // part of the room, and removing tiles would move the grid under a thumb.
    expect(screen.getByRole("radio", { name: "رائد" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "فضائي" })).toBeDisabled();
    // The pick skips what is gone.
    expect(
      screen.getByRole("radio", { name: "روبوت" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("marks the smaller side without choosing it for anyone", async () => {
    mount();
    await waitFor(() => screen.getByText("الأحمر"));
    const marked = document.querySelectorAll("[data-smaller-team]");
    expect(marked).toHaveLength(1);
    expect(
      marked[0].closest("[data-team-option]")?.getAttribute("data-team-option"),
    ).toBe("team-red");
    // Marked, not selected: the player still has to tap.
    expect(
      document
        .querySelector('[data-team-option="team-red"]')
        ?.getAttribute("data-selected"),
    ).toBe("false");
  });

  it("marks neither side when the teams are even", async () => {
    api.resolveJoinCode.mockResolvedValue(
      room({
        teams: [
          { id: "team-blue", name: "الأزرق", playerCount: 2 },
          { id: "team-red", name: "الأحمر", playerCount: 2 },
        ],
      }),
    );
    mount();
    await waitFor(() => screen.getByText("الأحمر"));
    expect(document.querySelectorAll("[data-smaller-team]")).toHaveLength(0);
  });

  it("says how many are on each side, and says it plainly when nobody is", async () => {
    api.resolveJoinCode.mockResolvedValue(
      room({
        teams: [
          { id: "team-blue", name: "الأزرق", playerCount: 2 },
          { id: "team-red", name: "الأحمر", playerCount: 0 },
        ],
      }),
    );
    mount();
    await waitFor(() => screen.getByText("2 لاعبين"));
    expect(screen.getByText("ما فيه أحد")).toBeTruthy();
  });

  it("sends the name, the side and the character together", async () => {
    const user = userEvent.setup();
    api.joinLiveSession.mockResolvedValue({
      credential: "c",
      credentialExpiresAt: "2026-01-01T01:00:00.000Z",
      participantId: "p1",
      sessionId: "s1",
      // The lobby mounts on success and reads the roster, so the snapshot
      // carries one the way the server always does.
      snapshot: { participants: [], teams: [] },
    });
    mount();
    await waitFor(() => screen.getByLabelText("اسمك"));
    await user.type(screen.getByLabelText("اسمك"), "ريم");
    await user.click(screen.getByRole("radio", { name: "مذنّب" }));
    await user.click(screen.getByText("الأحمر"));
    await user.click(screen.getByRole("button", { name: /يلا ندخل/ }));

    await waitFor(() => expect(api.joinLiveSession).toHaveBeenCalledTimes(1));
    expect(api.joinLiveSession.mock.calls[0][1]).toMatchObject({
      displayName: "ريم",
      requestedTeamId: "team-red",
      avatarKey: "comet",
    });
  });

  it("recovers when someone took the character mid-tap", async () => {
    const user = userEvent.setup();
    api.joinLiveSession.mockRejectedValue({
      response: { data: { code: "AVATAR_TAKEN" } },
    });
    mount();
    await waitFor(() => screen.getByLabelText("اسمك"));
    await user.type(screen.getByLabelText("اسمك"), "ريم");
    await user.click(screen.getByText("الأحمر"));
    await user.click(screen.getByRole("button", { name: /يلا ندخل/ }));

    // Two people scanning in the same second is the normal case in a living
    // room: the one who lands second is told, and the room is re-read.
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("أحد سبقك"),
    );
    expect(api.resolveJoinCode.mock.calls.length).toBeGreaterThan(1);
  });
});
