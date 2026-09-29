import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import {
  ClosestGameplayPanel,
  seedClosestEstimate,
} from "@/features/live-game-session/components/closest-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * A مين أقرب slider must not answer on the player's behalf.
 *
 * A range control has to put its thumb somewhere, and Pilot Batch 01 showed what
 * happens when that position is treated as an estimate: six of seventeen
 * authored ranges seeded the thumb exactly on the correct value, so a team that
 * touched nothing and pressed Confirm won the question outright. The physical
 * position is presentation. The estimate only exists once somebody makes one.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

/** The pilot range whose midpoint is the answer: Henry's 175 in 100→250. */
const LEAKY = { mode: "numeric-range", min: 100, max: 250, step: 5 } as const;

const runtimeWith = (state: Record<string, unknown> = {}) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "closest", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: ["mode:submit-estimate"],
    activeRound: { id: "round-1", sequence: 1, status: "active" },
    modeState: {
      phase: "collecting",
      currentItemIndex: 0,
      currentItemJson: JSON.stringify({
        id: "item-1",
        prompt: { ar: "كم هدفاً سجّل هنري؟" },
        slider: LEAKY,
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

const confirm = () => screen.getByTestId("closest-submit");

describe("a Closest slider before anybody touches it", () => {
  it("offers no estimate, and will not let one be confirmed", () => {
    const { gameplayCommand } = renderPhone();
    expect(screen.getByTestId("closest-estimate-slider")).toBeInTheDocument();
    // The affordance that would say "you chose X" is simply not there.
    expect(screen.queryByTestId("closest-value-bubble")).toBeNull();
    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    expect(gameplayCommand).not.toHaveBeenCalled();
  });

  it("sends nothing on mount", () => {
    const { gameplayCommand } = renderPhone();
    expect(gameplayCommand).not.toHaveBeenCalled();
  });

  it("tells a screen reader that no choice has been made", () => {
    renderPhone();
    expect(screen.getByTestId("closest-estimate-slider")).toHaveAttribute(
      "aria-valuetext",
      "لم تختاروا تقديركم بعد",
    );
  });

  /**
   * The thumb still has to sit somewhere legal — a value off the authored step
   * grid is refused by the server — but sitting there is not an answer.
   */
  it("still parks the thumb on a legal step without that counting as a choice", () => {
    renderPhone();
    const slider = screen.getByTestId("closest-estimate-slider");
    const seeded = seedClosestEstimate(LEAKY);
    expect(slider).toHaveValue(String(seeded));
    expect((seeded - LEAKY.min) % LEAKY.step).toBe(0);
    expect(confirm()).toBeDisabled();
  });
});

describe("a Closest slider once the player moves it", () => {
  it("takes a pointer or touch drag as the choice", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("closest-estimate-slider"), {
      target: { value: "200" },
    });
    expect(screen.getByTestId("closest-value-bubble")).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    // Moving is still local: the choice exists, the command does not.
    expect(gameplayCommand).not.toHaveBeenCalled();
  });

  /**
   * An adjustment key pressed at an endpoint changes nothing and so fires no
   * change event. It is still a deliberate act, and a keyboard player must not
   * be the one who cannot answer.
   */
  it("takes a keyboard adjustment as the choice, even at an endpoint", () => {
    renderPhone();
    const slider = screen.getByTestId("closest-estimate-slider");
    expect(confirm()).toBeDisabled();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(confirm()).toBeEnabled();
  });

  it("ignores a key that is not a slider adjustment", () => {
    renderPhone();
    fireEvent.keyDown(screen.getByTestId("closest-estimate-slider"), {
      key: "Tab",
    });
    expect(confirm()).toBeDisabled();
  });

  it("sends exactly one command, carrying the chosen value", () => {
    const { gameplayCommand } = renderPhone();
    const slider = screen.getByTestId("closest-estimate-slider");
    for (const value of ["120", "180", "215"])
      fireEvent.change(slider, { target: { value } });
    expect(gameplayCommand).not.toHaveBeenCalled();
    fireEvent.click(confirm());
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({ payload: { value: 215 } }),
    );
  });
});

describe("a Closest slider across a reconnect", () => {
  it("invents no commitment when the player rejoins before confirming", () => {
    const { unmount, gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("closest-estimate-slider"), {
      target: { value: "200" },
    });
    expect(confirm()).toBeEnabled();
    unmount();

    // The server still reports this team as not having answered, so the phone
    // must come back unanswered rather than holding the old local number.
    renderPhone(runtimeWith(), gameplayCommand);
    expect(screen.queryByTestId("closest-value-bubble")).toBeNull();
    expect(confirm()).toBeDisabled();
    expect(gameplayCommand).not.toHaveBeenCalled();
  });

  it("restores the authoritative estimate once the server has accepted it", () => {
    renderPhone(
      runtimeWith({
        submissionStatusJson: JSON.stringify({
          "team-alpha": true,
          "team-beta": false,
        }),
        ownSubmittedValue: 215,
      }),
    );
    // Committed: the controls are gone and the authoritative value is shown.
    expect(screen.queryByTestId("closest-answer-controls")).toBeNull();
    expect(screen.getByTestId("closest-phone-status")).toBeInTheDocument();
  });
});

describe("a legacy Closest item", () => {
  const legacy = () =>
    runtimeWith({
      currentItemJson: JSON.stringify({
        id: "legacy-1",
        prompt: { ar: "كم عدد الأهداف؟" },
      }),
    });

  it("keeps the plain number field, still gated on the player typing", () => {
    const { gameplayCommand } = renderPhone(legacy());
    expect(screen.queryByTestId("closest-estimate-slider")).toBeNull();
    expect(confirm()).toBeDisabled();
    const input = screen
      .getByTestId("closest-answer-controls")
      .querySelector("input")!;
    fireEvent.change(input, { target: { value: "42" } });
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());
    expect(gameplayCommand).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({ payload: { value: 42 } }),
    );
  });
});

/**
 * A calendar year is a value, not an amount.
 *
 * Pilot 02 drew the first-World-Cup question in a real Match and the phone read
 * «١٬٩٠٠ سنة … ١٬٩٣٠ سنة … ١٬٩٥٠ سنة» — a thousands separator and a duration
 * unit, so the year 1930 rendered as "1,930 years". The distinction is authored,
 * never inferred: these tests exist mostly to prove the fix did NOT quietly turn
 * grouping off for every four-digit number.
 */
describe("how a Closest number is written", () => {
  const load = async () =>
    (
      await import(
        "@/features/live-game-session/components/closest-gameplay-panel"
      )
    ).formatClosestValue;

  const year = {
    mode: "numeric-range",
    min: 1900,
    max: 1950,
    step: 1,
    displayFormat: "calendar-year",
  } as const;
  const quantity = {
    mode: "numeric-range",
    min: 0,
    max: 3000,
    step: 1,
    unit: "هدف",
  } as const;

  it("writes a calendar year ungrouped and with no unit", async () => {
    const format = await load();
    for (const [value, expected] of [
      [1900, "١٩٠٠"],
      [1930, "١٩٣٠"],
      [1950, "١٩٥٠"],
    ] as const) {
      const text = format(value, year);
      expect(text).toBe(expected);
      expect(text).not.toContain("٬");
      expect(text).not.toContain("سنة");
    }
  });

  /**
   * The load-bearing test. 1930 as a *count* must still be grouped and keep its
   * unit, which is what proves the year rule is carried by the authored format
   * rather than by the size of the number.
   */
  it("still groups the very same number when it is a quantity", async () => {
    const format = await load();
    const text = format(1930, quantity);
    expect(text).toContain("٬");
    expect(text).toContain("هدف");
    expect(text).not.toBe("١٩٣٠");
  });

  it("keeps units, decimals and the unauthored default untouched", async () => {
    const format = await load();
    expect(format(260, { ...quantity, unit: "هدف" })).toContain("هدف");
    expect(format(2.5, { mode: "numeric-range", min: 0, max: 10 })).toContain(
      "٢٫٥",
    );
    // An item authored before the field existed is a quantity.
    expect(format(1930, { mode: "numeric-range", min: 0, max: 3000 })).toContain(
      "٬",
    );
    // A between-anchors slider is unaffected.
    expect(
      format(50, {
        mode: "between-anchors",
        min: 0,
        max: 100,
        leftAnchor: "أ",
        rightAnchor: "ب",
      }),
    ).toBe("٥٠");
  });
});
