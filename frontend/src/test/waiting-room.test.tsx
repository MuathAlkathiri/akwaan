import { render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("@/features/live-game-session/api/live-session-api", async (load) => ({
  ...(await load<
    typeof import("@/features/live-game-session/api/live-session-api")
  >()),
  ...api,
}));

/**
 * The room that replaced team creation.
 *
 * Nobody builds a team here: the two sides exist, named by colour, and the host
 * only moves people across and says go. So what these hold is the part that
 * makes that replacement safe — that starting is never blocked, that a side with
 * nobody in it still reads as a side, and that «قسّمهم لي» sends its moves one
 * at a time, because each one invalidates the revision the next one needs.
 */
type Player = {
  id: string;
  displayName: string;
  teamId?: string;
  avatarKey?: string;
};

const snapshot = (players: Player[], actions = ["begin"]) =>
  ({
    sessionId: "s1",
    revision: 7,
    status: "waiting",
    availableActions: actions,
    teams: [
      { id: "team-blue", name: "الأزرق", active: true },
      { id: "team-red", name: "الأحمر", active: true },
    ],
    participants: [
      { id: "host", displayName: "المضيف", role: "controller", connected: true },
      ...players.map((player) => ({
        role: "team-player",
        ready: false,
        connected: true,
        presence: "connected",
        ...player,
      })),
    ],
  }) as unknown as LiveSessionSnapshot;

const command = vi.fn();

function mount(players: Player[], actions?: string[]) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(players, actions),
            connection: "connected",
            command,
          } as unknown as React.ContextType<typeof LiveSessionContext>
        }
      >
        <WaitingRoom />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("the waiting room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getJoinAccess.mockResolvedValue({
      joinCode: "YQ6WBTN",
      enabled: true,
      assignmentPolicy: "explicit",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
    api.createJoinAccess.mockResolvedValue({
      joinCode: "NEWCODE",
      enabled: true,
      assignmentPolicy: "explicit",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
  });

  it("shows the code so the room can join", async () => {
    mount([]);
    await waitFor(() =>
      expect(screen.getByTestId("waiting-room-code").textContent).toBe(
        "YQ6WBTN",
      ),
    );
  });

  // The regression that shipped: the unified setup flow issues no join code,
  // so the server answered with nothing and the one screen whose job is to let
  // people in had no way in. The room issues its own rather than making every
  // caller remember.
  it("issues a code when the session has none, and shows it", async () => {
    api.getJoinAccess.mockResolvedValue(null);
    mount([]);
    await waitFor(() =>
      expect(screen.getByTestId("waiting-room-code").textContent).toBe(
        "NEWCODE",
      ),
    );
    expect(api.createJoinAccess).toHaveBeenCalledTimes(1);
  });

  it("never issues a second code for a session that already has one", async () => {
    mount([]);
    await waitFor(() =>
      expect(screen.getByTestId("waiting-room-code").textContent).toBe(
        "YQ6WBTN",
      ),
    );
    expect(api.createJoinAccess).not.toHaveBeenCalled();
  });

  // A kicked player stays in the snapshot so a recap can still name them. The
  // room forgot to drop them, so they sat on the host's screen with a kick
  // button whose only possible answer was PARTICIPANT_REMOVED.
  it("drops a player the host already kicked", () => {
    mount([
      { id: "p1", displayName: "ريم", teamId: "team-blue" },
      {
        id: "p2",
        displayName: "سعد",
        teamId: "team-blue",
        presence: "removed",
      } as never,
    ]);
    expect(screen.getByText("ريم")).toBeInTheDocument();
    expect(screen.queryByText("سعد")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("waiting-room-player")).toHaveLength(1);
  });

  it("starts even with one side empty, and says so", async () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    const start = screen.getByTestId("waiting-room-start");
    // Never blocked here: the QR stays up on the challenge screen, so the
    // block that matters is the challenge's own start button.
    expect(start).not.toBeDisabled();
    expect(start.textContent).toContain("نبدأ واللي يتأخر يلحقنا");
    await userEvent.click(start);
    expect(command).toHaveBeenCalledWith("begin", {});
  });

  it("falls back to start for a session the older flow already made ready", async () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }], [
      "start",
      "cancel",
    ]);
    await userEvent.click(screen.getByTestId("waiting-room-start"));
    expect(command).toHaveBeenCalledWith("start", {});
  });

  it("has nothing to press when the session offers no way to start", () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }], ["cancel"]);
    expect(screen.getByTestId("waiting-room-start")).toBeDisabled();
  });

  it("reads as a plain go once both sides have somebody", () => {
    mount([
      { id: "p1", displayName: "ريم", teamId: "team-blue" },
      { id: "p2", displayName: "سعد", teamId: "team-red" },
    ]);
    expect(screen.getByTestId("waiting-room-start").textContent).toContain(
      "يلا نبدأ",
    );
  });

  it("names an empty side instead of hiding it", () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    expect(screen.getByText("الأحمر")).toBeInTheDocument();
    expect(screen.getByText("ما فيه أحد")).toBeInTheDocument();
  });

  it("leaves the host out of the teams", () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    expect(screen.getAllByTestId("waiting-room-player")).toHaveLength(1);
    expect(screen.queryByText("المضيف")).not.toBeInTheDocument();
  });

  it("moves a player across", async () => {
    api.assignParticipantTeam.mockResolvedValue({ revision: 8 });
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    await userEvent.click(
      screen.getByRole("button", { name: "انقل ريم للفريق الثاني" }),
    );
    await waitFor(() =>
      expect(api.assignParticipantTeam).toHaveBeenCalledWith(
        "s1",
        "p1",
        "team-red",
        7,
      ),
    );
  });

  it("splits them one request at a time, each on the revision the last returned", async () => {
    let revision = 7;
    api.assignParticipantTeam.mockImplementation(async () => {
      revision += 1;
      return { revision };
    });
    mount([
      { id: "p1", displayName: "ريم", teamId: "team-blue" },
      { id: "p2", displayName: "سعد", teamId: "team-blue" },
      { id: "p3", displayName: "نورة", teamId: "team-blue" },
      { id: "p4", displayName: "فهد", teamId: "team-blue" },
    ]);
    await userEvent.click(screen.getByTestId("waiting-room-split"));
    await waitFor(() =>
      expect(api.assignParticipantTeam).toHaveBeenCalledTimes(2),
    );
    // Sending both on revision 7 would have the server reject the second.
    expect(api.assignParticipantTeam.mock.calls[0][3]).toBe(7);
    expect(api.assignParticipantTeam.mock.calls[1][3]).toBe(8);
  });

  it("will not split a room that cannot be split", () => {
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    expect(screen.getByTestId("waiting-room-split")).toBeDisabled();
  });

  it("offers a side to whoever never picked one", async () => {
    api.assignParticipantTeam.mockResolvedValue({ revision: 8 });
    mount([{ id: "p1", displayName: "ريم" }]);
    expect(screen.getByTestId("waiting-room-unplaced")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "حط ريم في الأحمر" }),
    );
    await waitFor(() =>
      expect(api.assignParticipantTeam).toHaveBeenCalledWith(
        "s1",
        "p1",
        "team-red",
        7,
      ),
    );
  });

  // The host is the one who has to explain this to a room full of people, so
  // the server's own reason is what they get. A generic shrug sent everybody
  // guessing — including us.
  it("shows the server's own reason when an action is refused", async () => {
    api.assignParticipantTeam.mockRejectedValue(
      Object.assign(new Error("Request failed"), {
        isAxiosError: true,
        response: { data: { message: "الجلسة تغيّرت، حدّث الصفحة" } },
      }),
    );
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    await userEvent.click(
      screen.getByRole("button", { name: "انقل ريم للفريق الثاني" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("waiting-room-failure").textContent).toContain(
        "الجلسة تغيّرت، حدّث الصفحة",
      ),
    );
  });

  it("falls back to a plain sentence when the server gives no reason", async () => {
    api.removeLiveParticipant.mockRejectedValue(new Error("boom"));
    mount([{ id: "p1", displayName: "ريم", teamId: "team-blue" }]);
    await userEvent.click(screen.getByRole("button", { name: "اطرد ريم" }));
    await userEvent.click(screen.getByRole("button", { name: "اطرده" }));
    await waitFor(() =>
      expect(screen.getByTestId("waiting-room-failure").textContent).toContain(
        "boom",
      ),
    );
  });
});
