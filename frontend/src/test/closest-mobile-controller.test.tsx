import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { ClosestGameplayPanel } from "@/features/live-game-session/components/closest-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import { MobileActionArea } from "@/features/live-game-session/match/components/mobile-action-area";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * مين أقرب on a player's phone.
 *
 * The mechanic did not change: the same command, the same authoritative
 * submission status, the same deadline. What changed is which surface renders
 * what — so these assertions are mostly about what the phone *refuses* to show,
 * and about the host being left exactly as it was.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

const runtimeWith = (
  state: Record<string, unknown> = {},
  actions: string[] = ["mode:submit-estimate"],
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "closest", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeRound: { id: "round-1", sequence: 1, status: "active" },
    modeState: {
      phase: "collecting",
      currentItemIndex: 0,
      currentItemJson: JSON.stringify({
        id: "item-1",
        prompt: { ar: "كم طول برج المملكة بالمتر؟" },
        media: { type: "image", url: "https://cdn.test/tower.jpg" },
      }),
      teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
      submissionStatusJson: JSON.stringify({
        "team-alpha": false,
        "team-beta": false,
      }),
      assignedParticipantIdsJson: JSON.stringify({
        "team-alpha": "p-1",
        "team-beta": "p-2",
      }),
      actorTeamId: "team-alpha",
      isAssignedActor: true,
      deadlineAt: "2026-01-01T00:00:40.000Z",
      ...state,
    },
  }) as unknown as GameplayRuntimeSnapshot;

const context = (gameplayCommand = vi.fn()) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: TEAMS,
      participants: [
        { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
        { id: "p-2", displayName: "سالم", teamId: "team-beta", role: "player" },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

/** On a phone: inside the shell that only the participant view mounts. */
const renderPhone = (runtime = runtimeWith(), gameplayCommand = vi.fn()) => {
  const view = render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <MobileGameplayShell participantId="p-1">
        <ClosestGameplayPanel runtime={runtime} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { ...view, gameplayCommand };
};

/** On the host/shared screen: no phone shell, exactly as the router renders it. */
const renderHost = (runtime = runtimeWith(), gameplayCommand = vi.fn()) => {
  const view = render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <ClosestGameplayPanel runtime={runtime} />
    </LiveSessionContext.Provider>,
  );
  return { ...view, gameplayCommand };
};

describe("the phone is a controller", () => {
  it("makes the numeric answer the one dominant control", () => {
    renderPhone();
    const input = screen.getByTestId("closest-estimate-input");
    expect(input).toBeInTheDocument();
    // Exactly one place to type, and one place to send.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(input.className).toContain("h-20");
    expect(input.className).toContain("text-4xl");
  });

  it("keeps the decimal keyboard and the existing numeric semantics", () => {
    renderPhone();
    const input = screen.getByTestId("closest-estimate-input");
    expect(input).toHaveAttribute("inputMode", "decimal");
    expect(input).toHaveAttribute("dir", "ltr");
  });

  it("puts the send button in the shared thumb action area", () => {
    renderPhone();
    const area = screen.getByTestId("mobile-action-area");
    expect(within(area).getByTestId("closest-submit")).toBeInTheDocument();
  });

  it("submits the exact command the mechanic already used", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("closest-estimate-input"), {
      target: { value: "302" },
    });
    fireEvent.click(screen.getByTestId("closest-submit"));
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-estimate",
      payload: { value: 302 },
    });
  });

  it("cannot be made to send twice", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("closest-estimate-input"), {
      target: { value: "302" },
    });
    const send = screen.getByTestId("closest-submit");
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.click(send);
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(send).toBeDisabled();
  });

  it("shows a deliberate submitted state from the server's own status", () => {
    renderPhone(
      runtimeWith({
        submissionStatusJson: JSON.stringify({
          "team-alpha": true,
          "team-beta": false,
        }),
      }),
    );
    const status = screen.getByTestId("closest-phone-status");
    expect(status).toHaveTextContent("تم إرسال إجابتكم");
    expect(status).toHaveTextContent("ننتظر الفريق الثاني…");
    // The form is gone: there is nothing left to submit.
    expect(screen.queryByTestId("closest-estimate-input")).toBeNull();
  });

  it("keeps the authoritative countdown and adds no second one", () => {
    renderPhone();
    expect(screen.getAllByTestId("challenge-countdown")).toHaveLength(1);
  });

  it("uses the compact challenge frame", () => {
    renderPhone();
    // Compact is a real mode: it changes the frame's own padding scale.
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-4");
    // Progress stays; the challenge name does not, because the shell says it.
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "السؤال 1 من 3",
    );
    expect(screen.getByTestId("challenge-frame")).not.toHaveTextContent(
      "مين أقرب",
    );
  });
});

describe("the phone does not restate the shared screen", () => {
  it("shows no question media", () => {
    renderPhone();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("audio")).toBeNull();
  });

  it("carries no per-team submission scoreboard", () => {
    renderPhone();
    expect(screen.queryByTestId("closest-submission-status")).toBeNull();
    expect(screen.getByTestId("challenge-frame")).not.toHaveTextContent(
      "صقور الرياض",
    );
  });

  it("keeps one quiet line of the question for context", () => {
    renderPhone();
    // Present, but not the shared screen's hero treatment.
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("كم طول برج المملكة بالمتر؟");
    expect(heading.className).toContain("text-sm");
    expect(heading.className).not.toContain("text-[2rem]");
  });

  it("reduces the reveal to the one fact, not the host recap", () => {
    renderPhone(
      runtimeWith({
        phase: "revealed",
        revealedResultJson: JSON.stringify({
          correctValue: 302,
          answers: { "team-alpha": 300, "team-beta": 250 },
          distances: { "team-alpha": 2, "team-beta": 52 },
          winnerTeamId: "team-alpha",
          tie: false,
        }),
      }),
    );
    expect(screen.getByTestId("closest-phone-reveal")).toHaveTextContent("302");
    // The full host recap block is not rendered on a phone.
    expect(screen.queryByTestId("closest-item-reveal")).toBeNull();
  });
});

describe("privacy is unchanged: the phone gains nothing", () => {
  it("never carries the correct value before the server reveals it", () => {
    renderPhone();
    // `revealedResultJson` is absent while collecting; nothing may reconstruct it.
    expect(document.body.textContent).not.toContain("302");
  });

  it("never carries the opposing team's answer before the reveal", () => {
    renderPhone(
      runtimeWith({
        submissionStatusJson: JSON.stringify({
          "team-alpha": false,
          "team-beta": true,
        }),
      }),
    );
    expect(document.body.textContent).not.toContain("250");
  });

  it("shows no answer value the projection did not send", () => {
    // The server's submission status is a boolean; the phone must not claim to
    // know the number this team typed after the fact.
    renderPhone(
      runtimeWith({
        submissionStatusJson: JSON.stringify({
          "team-alpha": true,
          "team-beta": false,
        }),
      }),
    );
    const status = screen.getByTestId("closest-phone-status");
    expect(status.textContent).not.toMatch(/\d/);
  });
});

describe("the host is untouched", () => {
  it("keeps the full prompt, the media and the shared context", () => {
    renderHost();
    expect(screen.getByRole("heading", { level: 2 }).className).toContain(
      "text-[2rem]",
    );
    expect(document.querySelector("img")).not.toBeNull();
    expect(screen.getByTestId("closest-submission-status")).toBeInTheDocument();
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent("مين أقرب");
  });

  it("keeps its own non-compact frame", () => {
    renderHost();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
  });

  it("keeps the full recap", () => {
    renderHost(
      runtimeWith({
        phase: "revealed",
        revealedResultJson: JSON.stringify({
          correctValue: 302,
          answers: { "team-alpha": 300, "team-beta": 250 },
          distances: { "team-alpha": 2, "team-beta": 52 },
          winnerTeamId: "team-alpha",
          tie: false,
        }),
      }),
    );
    const recap = screen.getByTestId("closest-item-reveal");
    expect(recap).toHaveTextContent("302");
    expect(recap).toHaveTextContent("300");
    expect(recap).toHaveTextContent("250");
    expect(screen.queryByTestId("closest-phone-reveal")).toBeNull();
  });

  it("renders no phone action area", () => {
    renderHost();
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
  });
});

describe("the action area is a place, not a behaviour", () => {
  it("sits at the bottom of the space it is given, in normal flow", () => {
    render(
      <MobileActionArea>
        <button type="button">إرسال</button>
      </MobileActionArea>,
    );
    const area = screen.getByTestId("mobile-action-area");
    expect(area.className).toContain("mt-auto");
    // Never fixed: a fixed bar is what the software keyboard covers.
    expect(area.className).not.toContain("fixed");
    expect(area.className).not.toContain("sticky");
  });

  it("renders whatever it is handed and nothing of its own", () => {
    render(
      <MobileActionArea>
        <button type="button">إرسال</button>
      </MobileActionArea>,
    );
    const area = screen.getByTestId("mobile-action-area");
    expect(area.children).toHaveLength(1);
    expect(area).toHaveTextContent("إرسال");
  });
});
