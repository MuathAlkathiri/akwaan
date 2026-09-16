import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { LaTahriqhaGameplayPanel } from "@/features/live-game-session/components/la-tahriqha-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * "لا تحرقها" on the three surfaces it actually has.
 *
 * The captain's phone is the only one that may move a card; a teammate's phone
 * shows the same dish and the same live set and is read-only; the shared screen
 * shows the dish, the pressure and the reveal. What these tests check is that
 * the client honours the projection it was given — it never reconstructs a
 * correctness it was not sent, never shows the opponent's cards, and never
 * decides for itself who may act.
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

const CARDS = [
  { localId: "c1", label: "أرز" },
  { localId: "x1", label: "معكرونة" },
  { localId: "c2", label: "دجاج" },
  { localId: "c3", label: "بصل" },
  { localId: "x2", label: "جبن" },
  { localId: "c4", label: "طماطم" },
  { localId: "x3", label: "زيتون" },
  { localId: "c5", label: "بهار الكبسة" },
];

const DISH = {
  id: "item-1",
  dishName: "كبسة دجاج",
  dishNote: "الطريقة النجدية",
  media: null,
  ingredients: CARDS,
};

const ACTIONS = [
  "mode:select-la-tahriqha-ingredient",
  "mode:deselect-la-tahriqha-ingredient",
  "mode:lock-la-tahriqha-dish",
];

const baseState = (over: Record<string, unknown> = {}) => ({
  phase: "selecting",
  currentDishIndex: 0,
  dishCount: 3,
  minSelection: 3,
  maxSelection: 5,
  dishSeconds: 30,
  currentDishJson: JSON.stringify(DISH),
  deadlineAt: "2026-09-17T18:00:30.000Z",
  teamIdsJson: JSON.stringify([A, B]),
  teamStatusJson: JSON.stringify({
    [A]: { locked: false, committedCount: null },
    [B]: { locked: false, committedCount: null },
  }),
  captainParticipantIdsJson: JSON.stringify({ [A]: "p-1", [B]: "p-3" }),
  totalsJson: JSON.stringify({ [A]: 0, [B]: 0 }),
  resultsJson: "[]",
  ...over,
});

/** The captain's own phone: their team, their captaincy, their live set. */
const captainState = (over: Record<string, unknown> = {}) =>
  baseState({
    actorTeamId: A,
    isDishCaptain: true,
    ownSelectedJson: "[]",
    ...over,
  });

/** A teammate of that captain: same team, same set, no captaincy. */
const teammateState = (over: Record<string, unknown> = {}) =>
  baseState({
    actorTeamId: A,
    isDishCaptain: false,
    ownSelectedJson: JSON.stringify(["c1", "c2"]),
    ...over,
  });

const runtimeOf = (
  modeState: Record<string, unknown>,
  actions: string[] = ACTIONS,
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "la-tahriqha", version: 1 },
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
      serverTimestamp: "2026-09-17T18:00:10.000Z",
      teams: TEAMS,
      participants: [
        { id: "p-1", displayName: "مُعاذ", teamId: A, role: "player" },
        { id: "p-2", displayName: "سارة", teamId: A, role: "player" },
        { id: "p-3", displayName: "خالد", teamId: B, role: "player" },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const renderPhone = (
  modeState = captainState(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <MobileGameplayShell participantId="p-1">
        <LaTahriqhaGameplayPanel runtime={runtimeOf(modeState, actions)} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

const renderScreen = (modeState = baseState(), cmd = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <LaTahriqhaGameplayPanel runtime={runtimeOf(modeState, [])} />
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

describe("the لا تحرقها dish on the shared screen", () => {
  it("shows the dish and all eight cards without saying which belong", () => {
    renderScreen();
    expect(screen.getByTestId("la-tahriqha-dish-name")).toHaveTextContent(
      "كبسة دجاج",
    );
    for (const card of CARDS) {
      const node = screen.getByTestId(`la-tahriqha-card-${card.localId}`);
      expect(node).toHaveTextContent(card.label);
      // Nothing on a live card may carry a verdict.
      expect(node).not.toHaveAttribute("data-state");
      expect(node).toHaveAttribute("data-chosen", "false");
    }
  });

  it("names both dish captains, because the room argues with them", () => {
    renderScreen();
    const strip = screen.getByTestId("la-tahriqha-pressure");
    expect(strip).toHaveTextContent("مُعاذ");
    expect(strip).toHaveTextContent("خالد");
  });

  it("shows that a team is still choosing, and never what it chose", () => {
    renderScreen();
    expect(screen.getByTestId(`la-tahriqha-status-${A}`)).toHaveTextContent(
      "لسّه يختارون",
    );
    expect(screen.getByTestId(`la-tahriqha-status-${A}`)).toHaveAttribute(
      "data-locked",
      "false",
    );
  });

  it("releases the committed count once a team commits, and only the count", () => {
    renderScreen(
      baseState({
        teamStatusJson: JSON.stringify({
          [A]: { locked: true, committedCount: 4 },
          [B]: { locked: false, committedCount: null },
        }),
      }),
    );
    const teamA = screen.getByTestId(`la-tahriqha-status-${A}`);
    expect(teamA).toHaveAttribute("data-locked", "true");
    expect(teamA).toHaveTextContent("ثبّتوا 4 مكوّنات");
    // No card on the board has been marked as anyone's.
    for (const card of CARDS) {
      expect(
        screen.getByTestId(`la-tahriqha-card-${card.localId}`),
      ).toHaveAttribute("data-chosen", "false");
    }
  });

  it("keeps the running Signature totals on screen", () => {
    renderScreen(baseState({ totalsJson: JSON.stringify({ [A]: 7, [B]: 3 }) }));
    expect(screen.getByTestId(`la-tahriqha-total-${A}`)).toHaveTextContent("7");
    expect(screen.getByTestId(`la-tahriqha-total-${B}`)).toHaveTextContent("3");
  });
});

describe("the captain's phone", () => {
  it("sends one select command for a tapped card", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("la-tahriqha-card-c1"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "select-la-tahriqha-ingredient",
      payload: { ingredientId: "c1" },
    });
  });

  it("sends a deselect for a card that is already in the dish", () => {
    const { cmd } = renderPhone(
      captainState({ ownSelectedJson: JSON.stringify(["c1"]) }),
    );
    expect(screen.getByTestId("la-tahriqha-card-c1")).toHaveAttribute(
      "data-chosen",
      "true",
    );
    fireEvent.click(screen.getByTestId("la-tahriqha-card-c1"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "deselect-la-tahriqha-ingredient",
      payload: { ingredientId: "c1" },
    });
  });

  it("holds the commit shut below three and opens it at three", () => {
    renderPhone(captainState({ ownSelectedJson: JSON.stringify(["c1", "c2"]) }));
    expect(screen.getByTestId("la-tahriqha-commit")).toBeDisabled();
    expect(screen.getByTestId("la-tahriqha-commit")).toHaveTextContent(
      "اختاروا 3 مكوّنات على الأقل",
    );
  });

  it("commits the exact set the captain built", () => {
    const { cmd } = renderPhone(
      captainState({ ownSelectedJson: JSON.stringify(["c1", "c2", "c3"]) }),
    );
    const commit = screen.getByTestId("la-tahriqha-commit");
    expect(commit).toBeEnabled();
    fireEvent.click(commit);
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "lock-la-tahriqha-dish",
      payload: {},
    });
  });

  it("refuses a sixth card at the surface rather than sending it", () => {
    const { cmd } = renderPhone(
      captainState({
        ownSelectedJson: JSON.stringify(["c1", "c2", "c3", "c4", "c5"]),
      }),
    );
    expect(screen.getByTestId("la-tahriqha-card-x1")).toBeDisabled();
    fireEvent.click(screen.getByTestId("la-tahriqha-card-x1"));
    expect(cmd).not.toHaveBeenCalled();
    // …while a card already in the dish can still be taken back out.
    expect(screen.getByTestId("la-tahriqha-card-c1")).toBeEnabled();
  });

  it("counts the set against the recipe", () => {
    renderPhone(
      captainState({ ownSelectedJson: JSON.stringify(["c1", "c2", "c3"]) }),
    );
    expect(screen.getByTestId("la-tahriqha-selection-count")).toHaveTextContent(
      "3 من 5",
    );
  });

  it("goes quiet once the team has committed", () => {
    renderPhone(
      captainState({
        ownSelectedJson: JSON.stringify(["c1", "c2", "c3"]),
        teamStatusJson: JSON.stringify({
          [A]: { locked: true, committedCount: 3 },
          [B]: { locked: false, committedCount: null },
        }),
      }),
    );
    expect(screen.getByTestId("la-tahriqha-committed")).toHaveTextContent(
      "ننتظر الفريق الثاني",
    );
    expect(screen.queryByTestId("la-tahriqha-commit")).toBeNull();
    expect(screen.getByTestId("la-tahriqha-card-c1")).toHaveAttribute(
      "data-chosen",
      "true",
    );
  });
});

describe("a teammate's phone", () => {
  it("shows the same dish and the captain's live set, read-only", () => {
    const { cmd } = renderPhone(teammateState(), ACTIONS);
    for (const card of CARDS) {
      expect(
        screen.getByTestId(`la-tahriqha-card-${card.localId}`),
      ).toHaveTextContent(card.label);
    }
    expect(screen.getByTestId("la-tahriqha-card-c1")).toHaveAttribute(
      "data-chosen",
      "true",
    );
    fireEvent.click(screen.getByTestId("la-tahriqha-card-c3"));
    expect(cmd).not.toHaveBeenCalled();
    expect(screen.queryByTestId("la-tahriqha-commit")).toBeNull();
  });

  it("names the captain it is supposed to be arguing with", () => {
    renderPhone(teammateState());
    expect(screen.getByTestId("la-tahriqha-captain-line")).toHaveTextContent(
      "مُعاذ",
    );
  });

  it("tells the captain that it is their dish", () => {
    renderPhone(captainState());
    expect(screen.getByTestId("la-tahriqha-captain-line")).toHaveTextContent(
      "أنت قائد الطبق",
    );
  });
});

describe("the dish reveal", () => {
  const reveal = {
    dishIndex: 0,
    contentItemId: "item-1",
    dishName: "كبسة دجاج",
    correctIngredientIds: ["c1", "c2", "c3", "c4", "c5"],
    teams: [
      {
        teamId: A,
        selected: ["c1", "c2", "c3", "x1"],
        correctIds: ["c1", "c2", "c3"],
        wrongIds: ["x1"],
        points: 0,
        burned: true,
        perfect: false,
        understaffed: false,
        lockReason: "manual" as const,
        captainParticipantId: "p-1",
      },
      {
        teamId: B,
        selected: ["c1", "c2", "c3", "c4", "c5"],
        correctIds: ["c1", "c2", "c3", "c4", "c5"],
        wrongIds: [],
        points: 7,
        burned: false,
        perfect: true,
        understaffed: false,
        lockReason: "manual" as const,
        captainParticipantId: "p-3",
      },
    ],
    totalsAfter: { [A]: 0, [B]: 7 },
    resolutionReason: "both-locked" as const,
    resolvedAt: "2026-09-17T18:00:22.000Z",
  };

  const revealedState = (over: Record<string, unknown> = {}) =>
    baseState({
      phase: "revealed",
      deadlineAt: null,
      revealJson: JSON.stringify(reveal),
      actorTeamId: A,
      isDishCaptain: true,
      ownSelectedJson: JSON.stringify(["c1", "c2", "c3", "x1"]),
      ...over,
    });

  it("names the canonical recipe", () => {
    renderScreen(revealedState());
    const recipe = screen.getByTestId("la-tahriqha-correct-recipe");
    for (const label of ["أرز", "دجاج", "بصل", "طماطم", "بهار الكبسة"]) {
      expect(recipe).toHaveTextContent(label);
    }
  });

  it("calls a burn a burn and a perfect dish a perfect dish", () => {
    renderScreen(revealedState());
    expect(screen.getByTestId(`la-tahriqha-burn-${A}`)).toHaveTextContent(
      "احترقت",
    );
    expect(screen.getByTestId(`la-tahriqha-reveal-${A}`)).toHaveAttribute(
      "data-burned",
      "true",
    );
    expect(screen.getByTestId(`la-tahriqha-perfect-${B}`)).toHaveTextContent(
      "طبق مثالي",
    );
    expect(screen.getByTestId(`la-tahriqha-reveal-${B}`)).toHaveTextContent(
      "+7",
    );
    expect(screen.getByTestId(`la-tahriqha-reveal-${A}`)).toHaveTextContent(
      "+0",
    );
  });

  it("marks this actor's own wrong card on the board it was chosen from", () => {
    renderPhone(revealedState(), []);
    expect(screen.getByTestId("la-tahriqha-card-x1")).toHaveAttribute(
      "data-state",
      "burn",
    );
    expect(screen.getByTestId("la-tahriqha-card-c5")).toHaveAttribute(
      "data-state",
      "correct",
    );
    expect(screen.getByTestId("la-tahriqha-card-x2")).toHaveAttribute(
      "data-state",
      "missed",
    );
  });

  it("says when a set was committed by the clock rather than by a captain", () => {
    renderScreen(
      revealedState({
        revealJson: JSON.stringify({
          ...reveal,
          teams: [
            { ...reveal.teams[0], lockReason: "deadline" as const },
            reveal.teams[1],
          ],
        }),
      }),
    );
    expect(screen.getByTestId(`la-tahriqha-reveal-${A}`)).toHaveTextContent(
      "ثُبّت مع نهاية الوقت",
    );
  });

  it("says plainly when a team never reached three", () => {
    renderScreen(
      revealedState({
        revealJson: JSON.stringify({
          ...reveal,
          teams: [
            {
              ...reveal.teams[0],
              selected: ["c1", "c2"],
              correctIds: ["c1", "c2"],
              wrongIds: [],
              burned: false,
              understaffed: true,
              lockReason: "none" as const,
            },
            reveal.teams[1],
          ],
        }),
      }),
    );
    expect(screen.getByTestId(`la-tahriqha-reveal-${A}`)).toHaveTextContent(
      "ما وصلوا لثلاثة مكوّنات",
    );
  });

  it("offers the advance only where the server granted it", () => {
    renderScreen(revealedState());
    expect(screen.queryByTestId("la-tahriqha-advance")).toBeNull();
    render(
      <LiveSessionContext.Provider value={context(vi.fn())}>
        <LaTahriqhaGameplayPanel
          runtime={runtimeOf(revealedState(), ["mode:advance-la-tahriqha"])}
        />
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("la-tahriqha-advance")).toHaveTextContent(
      "الطبق التالي",
    );
  });
});

describe("the challenge recap", () => {
  it("shows the final internal totals and marks a tie as a tie", () => {
    renderScreen(
      baseState({
        phase: "completed",
        deadlineAt: null,
        resultJson: JSON.stringify({
          winnerTeamId: null,
          tie: true,
          totals: { [A]: 13, [B]: 13 },
        }),
      }),
    );
    expect(screen.getByTestId(`la-tahriqha-recap-${A}`)).toHaveTextContent("13");
    expect(screen.getByTestId("la-tahriqha-tie")).toHaveTextContent("تعادل");
  });
});

describe("a dish waiting for its Fair-Start", () => {
  it("shows no cards and no clock until the dish is activated", () => {
    renderScreen(baseState({ phase: "preparing", deadlineAt: null }));
    expect(screen.getByTestId("la-tahriqha-preparing")).toBeInTheDocument();
    expect(screen.queryByTestId("la-tahriqha-cards")).toBeNull();
  });
});
