import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { FirstNoteGameplayPanel } from "@/features/live-game-session/components/first-note-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * من أول نغمة on a player's phone — the first multi-phase controller.
 *
 * Two things decide this design. The Master audio is the room's, never the
 * hand's: the server deletes `audioJson` for any actor with a team, and these
 * tests hold that line from the client side too. And the primary control changes
 * with the authoritative phase, on one mounted panel — a bidder becomes an
 * answerer without anything remounting.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];
const MASTER = "/uploads/question-assets/master-clip.mp3";
const SONG = "طلال مداح — مقادير";

/** Exactly what the server sends a phone: `audioJson` is deleted for a team actor. */
const phoneState = (over: Record<string, unknown> = {}) => ({
  phase: "auction",
  currentSongIndex: 0,
  songCount: 3,
  contextualClueJson: JSON.stringify({ ar: "أغنية خليجية من الثمانينات" }),
  clueLabelJson: JSON.stringify({ ar: "الدليل" }),
  currentBidSeconds: 8,
  currentBidTeamId: "team-beta",
  biddingTeamId: "team-alpha",
  deadlineAt: "2026-01-01T00:00:40.000Z",
  canBid: true,
  canPass: true,
  canAnswer: false,
  actorTeamId: "team-alpha",
  ...over,
});

/** What the shared screen gets: the same state plus the Master audio. */
const screenState = (over: Record<string, unknown> = {}) => {
  const { canBid, canPass, canAnswer, actorTeamId, ...shared } = phoneState(over);
  void canBid;
  void canPass;
  void canAnswer;
  void actorTeamId;
  return {
    ...shared,
    audioJson: JSON.stringify({
      type: "audio",
      assets: [{ url: MASTER }],
    }),
  };
};

const runtimeOf = (
  modeState: Record<string, unknown>,
  actions = [
    "mode:submit-first-note-bid",
    "mode:pass-first-note-bid",
    "mode:submit-first-note-answer",
  ],
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "first-note", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeRound: { id: "round-1", sequence: 1, status: "active" },
    modeState,
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
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const phoneTree = (runtime: GameplayRuntimeSnapshot, cmd: ReturnType<typeof vi.fn>) => (
  <LiveSessionContext.Provider value={context(cmd)}>
    <MobileGameplayShell participantId="p-1">
      <FirstNoteGameplayPanel runtime={runtime} actor="participant" />
    </MobileGameplayShell>
  </LiveSessionContext.Provider>
);

const renderPhone = (
  modeState = phoneState(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  const view = render(phoneTree(runtimeOf(modeState, actions), cmd));
  return { ...view, cmd };
};

const renderHost = (modeState = screenState(), cmd = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <FirstNoteGameplayPanel runtime={runtimeOf(modeState)} actor="shared-screen" />
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

describe("the auction controller", () => {
  it("offers only the seconds the current floor allows", () => {
    // The floor is 8, so 1..7 are legal and 8 is not.
    renderPhone();
    const options = screen.getByTestId("first-note-bid-options");
    expect(within(options).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByTestId("first-note-bid-7")).toBeInTheDocument();
    expect(screen.queryByTestId("first-note-bid-8")).toBeNull();
  });

  it("re-derives the legal set when the floor moves", () => {
    renderPhone(phoneState({ currentBidSeconds: 3 }));
    expect(
      within(screen.getByTestId("first-note-bid-options")).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
    expect(screen.queryByTestId("first-note-bid-3")).toBeNull();
  });

  it("picks then confirms, and sends the mechanic's exact command", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("first-note-bid-5"));
    expect(screen.getByTestId("first-note-bid-5")).toHaveAttribute(
      "data-selected",
      "true",
    );
    fireEvent.click(screen.getByTestId("first-note-submit-bid"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-first-note-bid",
      payload: { seconds: 5 },
    });
  });

  it("cannot bid before a value is chosen", () => {
    renderPhone();
    expect(screen.getByTestId("first-note-submit-bid")).toBeDisabled();
  });

  it("prevents a duplicate bid in one window", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("first-note-bid-5"));
    fireEvent.click(screen.getByTestId("first-note-submit-bid"));
    fireEvent.click(screen.getByTestId("first-note-submit-bid"));
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first-note-submit-bid")).toHaveTextContent(
      "جارٍ الإرسال…",
    );
  });

  it("never claims the bid won: a competing snapshot simply takes over", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(phoneState(), undefined, cmd);
    fireEvent.click(screen.getByTestId("first-note-bid-5"));
    fireEvent.click(screen.getByTestId("first-note-submit-bid"));
    // The opponent got there first: the floor is now 4 and it is their bid.
    rerender(
      phoneTree(
        runtimeOf(
          phoneState({ currentBidSeconds: 4, currentBidTeamId: "team-beta" }),
        ),
        cmd,
      ),
    );
    // Server truth wins: a new legal set, no stale selection, guard released.
    expect(screen.queryByTestId("first-note-bid-5")).toBeNull();
    expect(screen.getByTestId("first-note-submit-bid")).toHaveTextContent(
      "اختاروا عدد الثواني",
    );
  });

  it("gives a team the server did not authorize no controls at all", () => {
    renderPhone(phoneState({ canBid: false, canPass: false }));
    expect(screen.queryByTestId("first-note-bid-options")).toBeNull();
    expect(screen.queryByTestId("first-note-submit-bid")).toBeNull();
    expect(screen.getByTestId("first-note-auction-waiting")).toHaveTextContent(
      "بانتظار الفريق الآخر",
    );
  });

  it("passes with the mechanic's own command, once", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("first-note-pass"));
    fireEvent.click(screen.getByTestId("first-note-pass"));
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "pass-first-note-bid",
      payload: {},
    });
  });

  it("shows the server's own deadline, and only one clock", () => {
    renderPhone();
    expect(screen.getAllByTestId("challenge-countdown")).toHaveLength(1);
  });
});

describe("the auction → answer transition happens in place", () => {
  it("swaps the primary control without remounting anything", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(phoneState(), undefined, cmd);
    const panelNode = screen.getByTestId("first-note-panel");
    expect(screen.getByTestId("first-note-bid-options")).toBeInTheDocument();

    rerender(
      phoneTree(
        runtimeOf(
          phoneState({
            phase: "answering",
            canBid: false,
            canPass: false,
            canAnswer: true,
            answerOwnerTeamId: "team-alpha",
            finalBidSeconds: 5,
          }),
        ),
        cmd,
      ),
    );
    // Same DOM node: nothing below the shell unmounted, so no fair-start
    // readiness could have been re-run by this transition.
    expect(screen.getByTestId("first-note-panel")).toBe(panelNode);
    // The bidding control is gone the moment the phase says so — no flash. The
    // whole auction section goes, not just its controls: a phase the server has
    // left must not linger because the actor merely lacks permission in it.
    expect(screen.queryByTestId("first-note-auction")).toBeNull();
    expect(screen.queryByTestId("first-note-bid-options")).toBeNull();
    expect(screen.getByTestId("first-note-answer-input")).toBeInTheDocument();
  });

  it("follows the server into a steal rather than deciding one", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(
      phoneState({
        phase: "answering",
        canBid: false,
        canAnswer: true,
        answerOwnerTeamId: "team-alpha",
      }),
      undefined,
      cmd,
    );
    expect(screen.getByTestId("first-note-answer-input")).toBeInTheDocument();
    // The server hands the steal to the other team.
    rerender(
      phoneTree(
        runtimeOf(
          phoneState({
            phase: "steal",
            canBid: false,
            canAnswer: false,
            answerOwnerTeamId: "team-beta",
          }),
        ),
        cmd,
      ),
    );
    expect(screen.queryByTestId("first-note-answer-input")).toBeNull();
    expect(screen.getByTestId("first-note-answer-waiting")).toHaveTextContent(
      "فرصة السرقة مع الفريق الآخر",
    );
  });
});

describe("the answer controller", () => {
  const answering = (over: Record<string, unknown> = {}) =>
    phoneState({
      phase: "answering",
      canBid: false,
      canPass: false,
      canAnswer: true,
      answerOwnerTeamId: "team-alpha",
      finalBidSeconds: 5,
      ...over,
    });

  it("gives the eligible team a large answer field and one CTA", () => {
    renderPhone(answering());
    expect(screen.getByTestId("first-note-answer-input").className).toContain(
      "h-16",
    );
    const area = screen.getByTestId("mobile-action-area");
    expect(within(area).getByTestId("first-note-submit-answer")).toBeInTheDocument();
  });

  it("sends the mechanic's exact answer command", () => {
    const { cmd } = renderPhone(answering());
    fireEvent.change(screen.getByTestId("first-note-answer-input"), {
      target: { value: "  مقادير  " },
    });
    fireEvent.click(screen.getByTestId("first-note-submit-answer"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-first-note-answer",
      payload: { answer: "مقادير" },
    });
  });

  it("prevents a duplicate answer", () => {
    const { cmd } = renderPhone(answering());
    fireEvent.change(screen.getByTestId("first-note-answer-input"), {
      target: { value: "مقادير" },
    });
    fireEvent.click(screen.getByTestId("first-note-submit-answer"));
    fireEvent.click(screen.getByTestId("first-note-submit-answer"));
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first-note-submit-answer")).toHaveTextContent(
      "جارٍ الإرسال…",
    );
  });

  it("gives an unauthorized team no answer form", () => {
    renderPhone(answering({ canAnswer: false, answerOwnerTeamId: "team-beta" }));
    expect(screen.queryByTestId("first-note-answer-input")).toBeNull();
    expect(screen.getByTestId("first-note-answer-waiting")).toHaveTextContent(
      "بانتظار الفريق المجيب",
    );
  });
});

describe("Master audio is the room's, never the hand's", () => {
  const phases = ["auction", "answering", "steal"] as const;

  it.each(phases)("renders no audio element on a phone during %s", (phase) => {
    renderPhone(
      phoneState({ phase, canAnswer: phase !== "auction", finalBidSeconds: 5 }),
    );
    expect(document.querySelector("audio")).toBeNull();
    expect(screen.queryByTestId("first-note-audio")).toBeNull();
    expect(screen.queryByTestId("first-note-audio-preload")).toBeNull();
  });

  it("never puts the Master URL anywhere in the phone subtree", () => {
    // Even if a future projection change wrongly sent it, presentation must not
    // put it in the DOM.
    renderPhone(
      phoneState({
        phase: "answering",
        canAnswer: true,
        finalBidSeconds: 5,
        audioJson: JSON.stringify({ type: "audio", assets: [{ url: MASTER }] }),
      }),
    );
    expect(document.body.innerHTML).not.toContain(MASTER);
    expect(document.body.innerHTML).not.toContain("master-clip");
  });

  it("never leaks the song identity before the reveal", () => {
    renderPhone(
      phoneState({
        phase: "answering",
        canAnswer: true,
        finalBidSeconds: 5,
        songTitle: SONG,
        correctAnswer: SONG,
      }),
    );
    expect(document.body.textContent).not.toContain(SONG);
  });

  it("does not tell the phone how long a clip it cannot hear runs", () => {
    renderPhone(
      phoneState({ phase: "answering", canAnswer: true, finalBidSeconds: 5 }),
    );
    expect(document.body.textContent).not.toContain("مدة المقطع");
  });
});

describe("the host keeps its production-verified Master path", () => {
  it("still renders the bounded Master player during answering", () => {
    renderHost(
      screenState({ phase: "answering", finalBidSeconds: 5 }),
    );
    const audio = screen.getByTestId("first-note-audio");
    expect(audio).toHaveAttribute("data-clip-seconds", "5");
    expect(audio.getAttribute("src")).toContain("master-clip");
  });

  it("still preloads the Master during the auction", () => {
    renderHost();
    expect(screen.getByTestId("first-note-audio-preload")).toBeInTheDocument();
  });

  it("keeps its non-compact frame, its eyebrow and its clip duration", () => {
    renderHost(screenState({ phase: "answering", finalBidSeconds: 5 }));
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "من أول نغمة",
    );
    expect(document.body.textContent).toContain("مدة المقطع");
  });

  it("renders no phone action area and no countdown of its own", () => {
    renderHost();
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
  });
});
