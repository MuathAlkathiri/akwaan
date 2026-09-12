import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { EkshifniGameplayPanel } from "@/features/live-game-session/components/ekshifni-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import { EKSHIFNI_OBSCURATION } from "@/components/akwaan/ekshifni-board";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * اكشفني on the two surfaces it actually has.
 *
 * The shared screen is the only thing that renders the picture; a phone is a
 * keypad and a text field. That split is enforced by the server's projection, so
 * what these tests check is that the client honours it and never reconstructs
 * what it was not sent — no mask drawn from a shape it does not have, no
 * celebrity name before the image is terminal, and no client-side decision about
 * who may act.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const A = "team-alpha";
const B = "team-beta";
const TEAMS = [
  { id: A, name: "أسود الشمال", active: true },
  { id: B, name: "صقور الرياض", active: true },
];
const CELEBRITY = "فيروز";
const IMAGE = "/uploads/celebrity.webp";

/** The shared projection: every region carries its box, revealed or not. */
const region = (index: number, revealed = false) => ({
  id: `r${index}`,
  number: index,
  revealed,
  shape: { x: 0.1 * index, y: 0.1, width: 0.12, height: 0.2 },
});
/** The phone projection: numbers only, never a box. */
const phoneRegion = (index: number, revealed = false) => ({
  id: `r${index}`,
  number: index,
  revealed,
});

/** Exactly the phone projection: numbers, no picture, no geometry. */
const phoneState = (over: Record<string, unknown> = {}) => ({
  phase: "playing",
  currentImageIndex: 0,
  imageCount: 3,
  imageNumber: 1,
  regionCount: 6,
  regionsJson: JSON.stringify([1, 2, 3, 4, 5, 6].map((n) => phoneRegion(n))),
  revealedRegionIdsJson: "[]",
  currentValue: 5,
  teamIdsJson: JSON.stringify([A, B]),
  selectingTeamId: A,
  initiativeTeamId: A,
  answerPenaltyTeamId: null,
  imageMediaJson: null,
  actorTeamId: A,
  hasInitiative: true,
  canReveal: true,
  canAnswer: true,
  ...over,
});

/** The shared screen's projection: the picture, plus geometry for what is off. */
const screenState = (over: Record<string, unknown> = {}) => ({
  ...phoneState(over),
  regionsJson: JSON.stringify([1, 2, 3, 4, 5, 6].map((n) => region(n))),
  imageMediaJson: JSON.stringify({
    type: "image",
    assets: [{ url: IMAGE, altText: "صورة" }],
  }),
  actorTeamId: undefined,
  hasInitiative: undefined,
  canReveal: undefined,
  canAnswer: undefined,
  ...over,
});

const ACTIONS = [
  "mode:reveal-ekshifni-region",
  "mode:submit-ekshifni",
  "mode:advance-ekshifni",
];

const runtimeOf = (modeState: Record<string, unknown>, actions = ACTIONS) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "ekshifni", version: 1 },
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
        { id: "p-1", displayName: "مُعاذ", teamId: A, role: "player" },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const renderPhone = (
  modeState = phoneState(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <MobileGameplayShell participantId="p-1">
        <EkshifniGameplayPanel
          runtime={runtimeOf(modeState, actions)}
          actor="participant"
        />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

const renderScreen = (modeState = screenState(), cmd = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <EkshifniGameplayPanel
        runtime={runtimeOf(modeState)}
        actor="shared-screen"
      />
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

describe("the اكشفني board on the shared screen", () => {
  it("obscures the whole picture and numbers every shut region", () => {
    renderScreen();
    const board = screen.getByTestId("ekshifni-board");
    expect(board).toHaveAttribute("data-unmasked", "false");
    expect(board).toHaveAttribute("data-obscured", "true");
    // The obscuration is on the picture itself, not on six panels over it.
    const layer = screen
      .getByTestId("ekshifni-obscured-layer")
      .querySelector("img")!;
    expect(layer.className).toContain(EKSHIFNI_OBSCURATION.fallbackClassName);
    expect(layer).toHaveStyle({ filter: EKSHIFNI_OBSCURATION.relative });
    // The clear original is not left sitting underneath it. The blurred copy is
    // opaque, so this changes nothing visually — it is the second lock: if the
    // obscuring layer ever failed to paint, a visible base would be the face.
    expect(screen.getByTestId("ekshifni-board-base").className).toContain(
      "invisible",
    );
    for (const number of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(`ekshifni-marker-${number}`)).toHaveTextContent(
        String(number),
      );
    }
    // Nothing is clear yet.
    expect(screen.queryByTestId("ekshifni-window-1")).toBeNull();
  });

  it("clears exactly the revealed region and nothing else", () => {
    renderScreen(
      screenState({
        regionsJson: JSON.stringify([
          region(1, true),
          ...[2, 3, 4, 5, 6].map((n) => region(n)),
        ]),
        revealedRegionIdsJson: JSON.stringify(["r1"]),
        currentValue: 4,
      }),
    );
    const window = screen.getByTestId("ekshifni-window-1");
    // The window sits on the authored fractions, and the picture inside it is
    // scaled and offset so exactly that slice shows: 0.12 wide of the source
    // means the inner copy is 1/0.12 of the frame, pushed left by x/width.
    expect(window).toHaveStyle({
      left: "10%",
      top: "10%",
      width: "12%",
      height: "20%",
    });
    const inner = window.querySelector("img")!;
    expect(inner).toHaveStyle({
      width: `${100 / 0.12}%`,
      height: `${100 / 0.2}%`,
      left: `${(-0.1 / 0.12) * 100}%`,
      top: `${(-0.1 / 0.2) * 100}%`,
    });
    // Its number is gone; every other region is still shut and still numbered.
    expect(screen.queryByTestId("ekshifni-marker-1")).toBeNull();
    for (const number of [2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(`ekshifni-marker-${number}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`ekshifni-window-${number}`)).toBeNull();
    }
    // And the picture underneath is still obscured.
    expect(screen.getByTestId("ekshifni-board")).toHaveAttribute(
      "data-obscured",
      "true",
    );
    expect(screen.getByTestId("ekshifni-value")).toHaveTextContent("4");
  });

  it("accumulates clear windows as more regions are bought", () => {
    renderScreen(
      screenState({
        regionsJson: JSON.stringify([
          region(1, true),
          region(2, true),
          region(3, true),
          ...[4, 5, 6].map((n) => region(n)),
        ]),
        revealedRegionIdsJson: JSON.stringify(["r1", "r2", "r3"]),
        currentValue: 2,
      }),
    );
    for (const number of [1, 2, 3]) {
      expect(screen.getByTestId(`ekshifni-window-${number}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`ekshifni-marker-${number}`)).toBeNull();
    }
    for (const number of [4, 5, 6]) {
      expect(screen.queryByTestId(`ekshifni-window-${number}`)).toBeNull();
      expect(screen.getByTestId(`ekshifni-marker-${number}`)).toBeInTheDocument();
    }
    // Three windows open, and the rest of the face is still unreadable.
    expect(screen.getByTestId("ekshifni-board")).toHaveAttribute(
      "data-obscured",
      "true",
    );
  });

  it("keeps the picture at its natural aspect, never cropped to a ratio", () => {
    // Fractional geometry is relative to the source, so a forced aspect would
    // slide every window off the feature it was drawn over.
    renderScreen();
    const base = screen.getByTestId("ekshifni-board-base");
    expect(base.className).toContain("w-auto");
    expect(base.className).toContain("max-w-full");
    expect(base.className).not.toContain("object-cover");
    expect(base.className).not.toMatch(/aspect-/);
  });

  it("says whose turn it is to choose, and that answering is open to both", () => {
    renderScreen();
    const line = screen.getByTestId("ekshifni-initiative");
    expect(line).toHaveTextContent("أسود الشمال");
    expect(line).toHaveTextContent("الإجابة مفتوحة للفريقين");
  });

  it("names nobody and nothing before the image resolves", () => {
    renderScreen();
    expect(document.body.textContent).not.toContain(CELEBRITY);
    // The picture is in the DOM but every pixel of it is behind the cover.
    expect(screen.getByTestId("ekshifni-board")).toHaveAttribute(
      "data-unmasked",
      "false",
    );
  });

  it("unmasks the picture and names the celebrity only once resolved", () => {
    renderScreen(
      screenState({
        phase: "resolved",
        revealJson: JSON.stringify({
          imageIndex: 0,
          identity: CELEBRITY,
          value: 4,
          winnerTeamId: B,
          resolvedBy: "answer",
          attempts: [
            { teamId: A, answer: "أم كلثوم", correct: false },
            { teamId: B, answer: CELEBRITY, correct: true },
          ],
          points: { [A]: 0, [B]: 4 },
          revealedRegionIds: ["r1"],
          resolvedAt: "2026-01-01T00:00:09.000Z",
        }),
      }),
    );
    const board = screen.getByTestId("ekshifni-board");
    expect(board).toHaveAttribute("data-unmasked", "true");
    // Terminal resolution is the whole photograph, clear: no blur left on it,
    // and no clipped windows, because there is nothing left to withhold.
    expect(board).toHaveAttribute("data-obscured", "false");
    // No obscuring layer at all, and the picture itself carries no blur.
    expect(screen.queryByTestId("ekshifni-obscured-layer")).toBeNull();
    const base = screen.getByTestId("ekshifni-board-base");
    expect(base.className).not.toContain(EKSHIFNI_OBSCURATION.fallbackClassName);
    expect(base.style.filter).toBe("");
    expect(base.className).not.toContain("invisible");
    expect(screen.queryByTestId("ekshifni-window-1")).toBeNull();
    expect(screen.queryByTestId("ekshifni-marker-1")).toBeNull();
    const reveal = screen.getByTestId("resolution-reveal");
    expect(reveal).toHaveTextContent(CELEBRITY);
    // Both submissions are shown, so the room can see how the race went.
    expect(reveal).toHaveTextContent("أم كلثوم");
    expect(reveal).toHaveTextContent("صقور الرياض");
  });

  it("does not claim a winner when the safety clock ended the image", () => {
    renderScreen(
      screenState({
        phase: "resolved",
        revealJson: JSON.stringify({
          imageIndex: 0,
          identity: CELEBRITY,
          value: 3,
          winnerTeamId: null,
          resolvedBy: "timeout",
          attempts: [],
          points: { [A]: 0, [B]: 0 },
          revealedRegionIds: [],
          resolvedAt: "2026-01-01T00:00:09.000Z",
        }),
      }),
    );
    expect(screen.getByTestId("resolution-reveal")).toHaveTextContent(
      "انتهت الصورة بدون إجابة صحيحة",
    );
  });

  it("carries the obscuration on the picture, with a fallback that still hides it", () => {
    // The protection moved: it is the blur on the photograph, not an opaque
    // panel. Both units are asserted because the relative one is what keeps a
    // television and a phone equally hard, and the static class is what still
    // obscures the face where container units are not supported — an invalid
    // inline filter is dropped and the class below it wins.
    renderScreen();
    expect(EKSHIFNI_OBSCURATION.relative).toMatch(/^blur\(/);
    expect(EKSHIFNI_OBSCURATION.fallbackClassName).toMatch(/^blur-/);
    const layer = screen.getByTestId("ekshifni-obscured-layer");
    const blurred = layer.querySelector("img")!;
    expect(blurred).toHaveStyle({ filter: EKSHIFNI_OBSCURATION.relative });
    expect(blurred.className).toContain(EKSHIFNI_OBSCURATION.fallbackClassName);
  });

  it("withholds the picture rather than show it unmasked", () => {
    // A projection that loses geometry must not degrade into "no masks": the
    // panels are the only thing between the room and the answer, so a mask that
    // cannot be placed takes the whole picture off screen with it.
    renderScreen(
      screenState({
        regionsJson: JSON.stringify(
          [1, 2, 3, 4, 5, 6].map((n) => phoneRegion(n)),
        ),
      }),
    );
    const board = screen.getByTestId("ekshifni-board");
    expect(board).toHaveAttribute("data-withheld", "true");
    expect(screen.queryByTestId("ekshifni-marker-1")).toBeNull();
    expect(board).toHaveTextContent("تعذّر عرض الصورة الآن");
  });
});

describe("اكشفني on a player's phone", () => {
  it("renders no picture at all", () => {
    renderPhone();
    expect(screen.queryByTestId("ekshifni-board")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.body.innerHTML).not.toContain(IMAGE);
  });

  it("offers the six numbers to the team holding initiative", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("ekshifni-pick-3"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "reveal-ekshifni-region",
      payload: { regionId: "r3" },
    });
  });

  it("offers no numbers to the team without initiative", () => {
    renderPhone(
      phoneState({ hasInitiative: false, canReveal: false, initiativeTeamId: B }),
    );
    expect(screen.queryByTestId("ekshifni-pick-3")).toBeNull();
    expect(screen.getByTestId("ekshifni-no-initiative")).toHaveTextContent(
      "الفريق الثاني يختار الجزء التالي",
    );
  });

  it("still offers the answer field to the team without initiative", () => {
    // Initiative and eligibility are different rights: not your turn to choose
    // is not the same as not your turn to answer.
    const { cmd } = renderPhone(
      phoneState({ hasInitiative: false, canReveal: false, canAnswer: true }),
    );
    fireEvent.change(screen.getByTestId("ekshifni-answer-input"), {
      target: { value: " فيروز " },
    });
    fireEvent.click(screen.getByTestId("ekshifni-answer-submit"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-ekshifni",
      payload: { answer: CELEBRITY },
    });
  });

  it("closes the answer field for a team waiting out a wrong answer", () => {
    renderPhone(phoneState({ canAnswer: false, answerPenaltyTeamId: A }));
    expect(screen.queryByTestId("ekshifni-answer-input")).toBeNull();
    const locked = screen.getByTestId("ekshifni-answer-locked");
    // Temporary, and worded as temporary — never as elimination.
    expect(locked).toHaveTextContent("ترجع لكم الإجابة بعد حركة الفريق الثاني");
    expect(locked).not.toHaveTextContent("خسرتم");
  });

  it("tells the team without initiative that it may still answer", () => {
    renderPhone(
      phoneState({ hasInitiative: false, canReveal: false, canAnswer: true }),
    );
    expect(screen.getByTestId("ekshifni-controller")).toHaveTextContent(
      "الإجابة مفتوحة لكم في أي وقت",
    );
  });

  it("shows a taken number as taken, and refuses to send it again", () => {
    const { cmd } = renderPhone(
      phoneState({
        regionsJson: JSON.stringify([
          phoneRegion(1, true),
          ...[2, 3, 4, 5, 6].map((n) => phoneRegion(n)),
        ]),
        revealedRegionIdsJson: JSON.stringify(["r1"]),
      }),
    );
    const taken = screen.getByTestId("ekshifni-pick-1");
    expect(taken).toBeDisabled();
    fireEvent.click(taken);
    expect(cmd).not.toHaveBeenCalled();
  });

  it("shows no control the server did not offer", () => {
    // `availableActions` is the server's word on what this phone may send; a
    // right the projection grants but the runtime has not opened is still shut.
    renderPhone(phoneState(), []);
    expect(screen.queryByTestId("ekshifni-pick-1")).toBeNull();
    expect(screen.queryByTestId("ekshifni-answer-input")).toBeNull();
  });

  it("uses the compact frame and never repeats the challenge name", () => {
    renderPhone();
    const frame = screen.getByTestId("challenge-frame");
    expect(frame).toHaveTextContent("المشهور 1 من 3");
    expect(frame).not.toHaveTextContent("اكشفني");
  });
});
