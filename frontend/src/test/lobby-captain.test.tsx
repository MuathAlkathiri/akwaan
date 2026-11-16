import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { WaitingRoom } from "@/features/live-game-session/components/waiting-room";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

const api = vi.hoisted(() => ({
  getJoinAccess: vi.fn(),
  createJoinAccess: vi.fn(),
  assignParticipantTeam: vi.fn(),
  removeLiveParticipant: vi.fn(),
  setTeamCaptain: vi.fn(),
}));
vi.mock("@/features/live-game-session/api/live-session-api", async (load) => ({
  ...(await load<
    typeof import("@/features/live-game-session/api/live-session-api")
  >()),
  ...api,
}));

/**
 * The lobby captain: optional, per team, chosen by the host before the Match.
 *
 * Nothing chosen means the side's turns rotate over everyone on it, and the
 * picker says so in words, because "no captain" must not read as "broken".
 */
const snapshot = (captains: Record<string, string | undefined> = {}) =>
  ({
    sessionId: "s1",
    revision: 7,
    status: "waiting",
    availableActions: ["begin"],
    teams: [
      { id: "team-blue", name: "الأزرق", active: true, captainParticipantId: captains["team-blue"] },
      { id: "team-red", name: "الأحمر", active: true, captainParticipantId: captains["team-red"] },
    ],
    participants: [
      { id: "host", displayName: "المضيف", role: "controller", connected: true },
      ...[
        ["p1", "سارة", "team-blue"],
        ["p2", "خالد", "team-blue"],
        ["p3", "نورة", "team-red"],
      ].map(([id, displayName, teamId]) => ({
        id,
        displayName,
        teamId,
        role: "team-player",
        ready: false,
        connected: true,
        presence: "connected",
      })),
    ],
  }) as unknown as LiveSessionSnapshot;

function mount(captains?: Record<string, string | undefined>) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(captains),
            connection: "connected",
            command: vi.fn(),
          } as unknown as React.ContextType<typeof LiveSessionContext>
        }
      >
        <WaitingRoom />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("the lobby captain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getJoinAccess.mockResolvedValue({
      joinCode: "YQ6WBTN",
      enabled: true,
      assignmentPolicy: "explicit",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
    api.setTeamCaptain.mockResolvedValue(snapshot());
  });

  it("offers no captain first, then only that side's players", () => {
    mount();
    const picker = screen.getByTestId("waiting-room-captain-team-blue");
    const options = within(picker).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "بدون قائد",
      "سارة",
      "خالد",
    ]);
    expect((picker as HTMLSelectElement).value).toBe("");
    expect(screen.getByLabelText("قائد الفريق", { selector: "#captain-team-blue" })).toBe(picker);
  });

  it("says that no captain means automatic rotation", () => {
    mount();
    const picker = screen.getByTestId("waiting-room-captain-team-red");
    const hint = document.getElementById(picker.getAttribute("aria-describedby")!);
    expect(hint?.textContent).toContain("بدون قائد = تناوب تلقائي");
  });

  it("sends the host's pick, and null for none", async () => {
    const user = userEvent.setup();
    mount({ "team-blue": "p1" });
    const picker = screen.getByTestId("waiting-room-captain-team-blue");
    expect((picker as HTMLSelectElement).value).toBe("p1");
    await user.selectOptions(picker, "p2");
    await waitFor(() =>
      expect(api.setTeamCaptain).toHaveBeenCalledWith("s1", "team-blue", "p2", 7),
    );
    await user.selectOptions(picker, "");
    await waitFor(() =>
      expect(api.setTeamCaptain).toHaveBeenLastCalledWith("s1", "team-blue", null, 7),
    );
  });

  it("marks the captain on their row", () => {
    mount({ "team-blue": "p2" });
    const badges = screen.getAllByTestId("waiting-room-captain-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("li")?.textContent).toContain("خالد");
  });

  it("reads a captain who left the side as none", () => {
    mount({ "team-red": "p1" });
    expect(
      (screen.getByTestId("waiting-room-captain-team-red") as HTMLSelectElement).value,
    ).toBe("");
    expect(screen.queryByTestId("waiting-room-captain-badge")).toBeNull();
  });
});
