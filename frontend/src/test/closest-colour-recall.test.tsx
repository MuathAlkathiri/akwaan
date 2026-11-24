import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUE_TRACK,
  hueColour,
  hueDistance,
} from "@/features/live-game-session/closest-colour";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * «تذكّر اللون»: a مين أقرب question whose answer is a colour. The picture is
 * shown in colour until the server's moment passes, then in grey; each team
 * slides along the colour wheel to the colour it remembers.
 */

const mocks = vi.hoisted(() => ({
  gameplayCommand: vi.fn(),
  /** Milliseconds left until each ISO deadline the panel asks about. */
  remaining: {} as Record<string, number>,
  /** Which surface is rendering: the phone holds the slider, the screen the picture. */
  phone: false,
}));

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    connection: "connected",
    gameplayCommand: mocks.gameplayCommand,
    snapshot: {
      teams: [
        { id: "team-1", name: "الفريق الأول" },
        { id: "team-2", name: "الفريق الثاني" },
      ],
      participants: [{ id: "player-1", displayName: "معاذ" }],
    },
  }),
}));

vi.mock("@/features/live-game-session/hooks/use-interaction-deadline", () => ({
  useInteractionDeadline: (deadlineAt?: string, terminal = false) =>
    !deadlineAt || terminal ? undefined : mocks.remaining[deadlineAt],
}));

vi.mock(
  "@/features/live-game-session/match/components/mobile-gameplay-shell",
  async (original) => ({
    ...(await original<
      typeof import("@/features/live-game-session/match/components/mobile-gameplay-shell")
    >()),
    useMobileSurface: () => mocks.phone,
  }),
);

import { ClosestGameplayPanel } from "@/features/live-game-session/components/closest-gameplay-panel";

const DEADLINE = "2026-01-01T00:00:45.000Z";
const GREY_AT = "2026-01-01T00:00:04.000Z";

const colourItem = {
  id: "item-1",
  prompt: "وش لون القميص؟",
  media: { type: "image", url: "https://cdn/shirt.webp", altText: "قميص" },
  slider: { mode: "colour-hue", min: 0, max: 360, step: 1 },
};

const runtime = (modeState: Record<string, unknown> = {}) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 1,
    mode: { key: "closest", version: 1, stateSchemaVersion: 1 },
    modeState: {
      currentItemJson: JSON.stringify(colourItem),
      teamIdsJson: JSON.stringify(["team-1", "team-2"]),
      submissionStatusJson: JSON.stringify({
        "team-1": false,
        "team-2": false,
      }),
      assignedParticipantIdsJson: JSON.stringify({ "team-1": "player-1" }),
      currentItemIndex: 0,
      phase: "collecting",
      deadlineAt: DEADLINE,
      mediaGreyAt: GREY_AT,
      actorTeamId: "team-1",
      isAssignedActor: true,
      ...modeState,
    },
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState: {},
      transitionRevision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    completedRounds: [],
    transitions: [],
    availableActions: ["mode:submit-estimate"],
    serverTimestamp: "2026-01-01T00:00:00.000Z",
  }) satisfies GameplayRuntimeSnapshot;

const picture = () => screen.getByTestId("closest-question-image");

describe("مين أقرب — تذكّر اللون", () => {
  beforeEach(() => {
    mocks.gameplayCommand.mockReset();
    mocks.remaining = { [DEADLINE]: 45_000 };
    mocks.phone = false;
  });

  describe("the colour helpers", () => {
    it("wraps a hue onto the wheel", () => {
      expect(hueColour(0)).toBe(hueColour(360));
      expect(hueColour(-30)).toBe(hueColour(330));
      expect(hueColour(210)).toBe("hsl(210 85% 50%)");
    });

    it("lays the whole wheel along the track, red at both ends", () => {
      expect(HUE_TRACK.startsWith("linear-gradient(to right, ")).toBe(true);
      const stops = HUE_TRACK.match(/hsl\([^)]*\)/g) ?? [];
      expect(stops).toHaveLength(7);
      expect(stops[0]).toBe(stops[6]);
    });

    it("measures two hues the short way round", () => {
      expect(hueDistance(10, 350)).toBe(20);
      expect(hueDistance(200, 230)).toBe(30);
      expect(hueDistance(0, 180)).toBe(180);
    });
  });

  describe("the picture", () => {
    it("is in colour while the server's moment has not passed", () => {
      mocks.remaining[GREY_AT] = 3_000;
      render(<ClosestGameplayPanel runtime={runtime()} />);
      expect(picture().dataset.colour).toBe("shown");
      expect(picture().className).not.toContain("grayscale");
    });

    it("turns grey once that moment passes", () => {
      mocks.remaining[GREY_AT] = 0;
      render(<ClosestGameplayPanel runtime={runtime()} />);
      expect(picture().dataset.colour).toBe("grey");
      expect(picture().className).toContain("grayscale");
    });

    it("is grey when no moment has been given: never colour by default", () => {
      render(
        <ClosestGameplayPanel
          runtime={runtime({ mediaGreyAt: null, deadlineAt: null })}
        />,
      );
      expect(picture().dataset.colour).toBe("grey");
    });

    it("gets its colour back at the reveal", () => {
      mocks.remaining[GREY_AT] = 0;
      render(
        <ClosestGameplayPanel
          runtime={runtime({
            phase: "revealed",
            revealedResultJson: JSON.stringify({
              correctValue: 210,
              answers: { "team-1": 200, "team-2": 30 },
              distances: { "team-1": 10, "team-2": 180 },
              winnerTeamId: "team-1",
              tie: false,
            }),
          })}
        />,
      );
      expect(picture().dataset.colour).toBe("shown");
    });

    it("leaves an ordinary picture question alone", () => {
      render(
        <ClosestGameplayPanel
          runtime={runtime({
            currentItemJson: JSON.stringify({
              ...colourItem,
              slider: { mode: "numeric-range", min: 0, max: 100, step: 1 },
            }),
            mediaGreyAt: undefined,
          })}
        />,
      );
      expect(picture().dataset.colour).toBeUndefined();
      expect(picture().className).not.toContain("grayscale");
    });
  });

  describe("the slider", () => {
    it("is the colour wheel, and sends the hue the player stopped on", () => {
      mocks.phone = true;
      render(<ClosestGameplayPanel runtime={runtime()} />);
      expect(screen.getByTestId("closest-colour-hue-slider")).toBeTruthy();
      const slider = screen.getByTestId(
        "closest-estimate-slider",
      ) as HTMLInputElement;
      expect(slider.className).toContain("closest-slider--colour");
      expect(slider.style.getPropertyValue("--closest-track")).toBe(HUE_TRACK);
      expect(slider.min).toBe("0");
      expect(slider.max).toBe("360");

      fireEvent.change(slider, { target: { value: "210" } });
      expect(slider.style.getPropertyValue("--closest-thumb")).toBe(
        hueColour(210),
      );
      const swatch = screen.getByTestId("closest-colour-swatch");
      expect(swatch.style.background).toBeTruthy();
      expect(slider.getAttribute("aria-valuetext")).toBe(
        "درجة اللون 210 من 360",
      );

      fireEvent.click(screen.getByTestId("closest-submit"));
      expect(mocks.gameplayCommand).toHaveBeenCalledWith(
        "gameplay-command",
        expect.objectContaining({
          commandType: "submit-estimate",
          payload: { value: 210 },
        }),
      );
    });

    it("cannot be confirmed before the player has chosen a colour", () => {
      mocks.phone = true;
      render(<ClosestGameplayPanel runtime={runtime()} />);
      expect(screen.queryByTestId("closest-colour-swatch")).toBeNull();
      fireEvent.click(screen.getByTestId("closest-submit"));
      expect(mocks.gameplayCommand).not.toHaveBeenCalled();
    });
  });

  describe("the reveal", () => {
    it("shows the correct colour and each team's colour, not numbers", () => {
      render(
        <ClosestGameplayPanel
          runtime={runtime({
            phase: "revealed",
            revealedResultJson: JSON.stringify({
              correctValue: 210,
              answers: { "team-1": 200, "team-2": null },
              distances: { "team-1": 10, "team-2": null },
              winnerTeamId: "team-1",
              tie: false,
            }),
          })}
        />,
      );
      expect(screen.getByText("اللون الصحيح")).toBeTruthy();
      expect(screen.getByTestId("closest-correct-colour")).toBeTruthy();
      expect(screen.getByTestId("closest-team-colour-team-1")).toBeTruthy();
      expect(screen.queryByTestId("closest-team-colour-team-2")).toBeNull();
      expect(screen.getByText("بفارق 10 درجة لون")).toBeTruthy();
      expect(screen.queryByText("210")).toBeNull();
    });
  });
});
