import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * Closest question media: the live gameplay panel must render an image or
 * play audio for the current item's server-projected safe media, reusing the
 * same canonical renderer RYO does — without inferring the media type from
 * the URL — while the numeric estimate flow stays untouched.
 */

const mocks = vi.hoisted(() => ({ gameplayCommand: vi.fn() }));

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    connection: "connected",
    gameplayCommand: mocks.gameplayCommand,
    snapshot: {
      teams: [{ id: "team-1", name: "صقور الرياض" }],
      participants: [{ id: "player-1", displayName: "معاذ" }],
    },
  }),
}));

vi.mock("@/features/live-game-session/hooks/use-interaction-deadline", () => ({
  useInteractionDeadline: () => undefined,
}));

import { ClosestGameplayPanel } from "@/features/live-game-session/components/closest-gameplay-panel";

const runtimeWithItem = (item: Record<string, unknown>) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 1,
    mode: { key: "closest", version: 1, stateSchemaVersion: 1 },
    modeState: {
      currentItemJson: JSON.stringify({ id: "item-1", prompt: "السؤال", ...item }),
      teamIdsJson: JSON.stringify(["team-1"]),
      submissionStatusJson: JSON.stringify({ "team-1": false }),
      assignedParticipantIdsJson: JSON.stringify({ "team-1": "player-1" }),
      currentItemIndex: 0,
      phase: "answering",
      actorTeamId: "team-1",
      isAssignedActor: true,
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

describe("مين أقرب — question media", () => {
  beforeEach(() => mocks.gameplayCommand.mockReset());

  it("renders no media for a text-only question", () => {
    render(<ClosestGameplayPanel runtime={runtimeWithItem({ media: null })} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("audio")).toBeNull();
    expect(screen.getByPlaceholderText("اكتب تقدير فريقك")).toBeTruthy();
  });

  it("renders the image for an image question at the expected src", () => {
    render(
      <ClosestGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "image", url: "https://cdn/closest.webp", altText: "صورة" },
        })}
      />,
    );
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://cdn/closest.webp");
    expect(img?.getAttribute("alt")).toBe("صورة");
    expect(document.querySelector("audio")).toBeNull();
  });

  it("renders the canonical audio player for an audio question, no image", () => {
    render(
      <ClosestGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "audio", url: "https://cdn/closest.mp3" },
        })}
      />,
    );
    expect(screen.getByTestId("marhala-question-audio")).toBeTruthy();
    expect(document.querySelector("audio")?.getAttribute("src")).toBe(
      "https://cdn/closest.mp3",
    );
    expect(document.querySelector("img")).toBeNull();
  });

  it("leaves the numeric answer UI unaffected by media presence", () => {
    render(
      <ClosestGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "image", url: "https://cdn/closest.webp" },
        })}
      />,
    );
    const input = screen.getByPlaceholderText("اكتب تقدير فريقك");
    expect(input).toBeTruthy();
    expect(screen.getByRole("button", { name: "إرسال" })).toBeTruthy();
  });
});
