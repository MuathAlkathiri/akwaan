import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "@/features/live-game-session/model";

/**
 * RYO question media: the live gameplay panel must render an image or play
 * audio for the current item's server-projected safe media, exactly as the
 * shared/canonical renderer does for every other mechanic — without ever
 * inferring the media type from the URL.
 */

const mocks = vi.hoisted(() => ({
  snapshot: {
    sessionId: "session-1",
    revision: 4,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: [
      { id: "team-a", name: "أسود الشمال" },
      { id: "team-b", name: "صقور الرياض" },
    ],
    participants: [],
    availableActions: [],
  } as unknown as LiveSessionSnapshot,
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  presentationReadySocket: vi.fn(),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: mocks.snapshot,
    snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
    presentationReadySocket: mocks.presentationReadySocket,
  }),
}));

import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";

const runtimeWithItem = (item: Record<string, unknown>) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 7,
    mode: { key: "read-your-opponent", version: 1, stateSchemaVersion: 1 },
    modeState: { currentItemIndex: 0 },
    presentationSurface: undefined,
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState: { answeringTeamId: "team-a", opposingTeamId: "team-b" },
      transitionRevision: 1,
      createdAt: "2026-01-01T00:00:10.000Z",
      startedAt: "2026-01-01T00:00:10.000Z",
      interaction: {
        id: "interaction-1",
        revision: 3,
        status: "open",
        prompt: {
          id: "p-1",
          type: "ryo.item",
          schemaVersion: 1,
          payload: {
            itemJson: JSON.stringify({
              id: "item-1",
              prompt: { ar: "من رفع كأس العالم 2022؟" },
              answerMode: "multiple_choice",
              options: [{ id: "team-a", label: { ar: "الأرجنتين" } }],
              ...item,
            }),
            actorRole: "opposing",
            isAssignedActor: true,
            answererParticipantId: "p-answerer",
            deciderParticipantId: "p-decider",
          },
          visibleFrom: "2026-01-01T00:00:10.000Z",
          deadlineAt: "2026-01-01T00:00:35.000Z",
          metadata: {},
        },
        submissions: [],
      },
    },
    availableActions: ["submission:create"],
  }) as unknown as GameplayRuntimeSnapshot;

beforeEach(() => {
  mocks.gameplayCommand.mockReset();
  mocks.presentationReadySocket.mockReset();
  mocks.connection = "connected";
});

describe("اقرأ خصمك — question media", () => {
  it("renders no media for a text-only question", () => {
    render(<RyoGameplayPanel runtime={runtimeWithItem({ media: null })} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("audio")).toBeNull();
    // Existing controls are unaffected by the absence of media.
    expect(screen.getByTestId("ryo-decision-controls")).toBeTruthy();
  });

  it("renders the image for an image question at the expected src, controls unaffected", () => {
    render(
      <RyoGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "image", url: "https://cdn/ryo.webp", altText: "صورة" },
        })}
      />,
    );
    const img = document.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://cdn/ryo.webp");
    expect(img?.getAttribute("alt")).toBe("صورة");
    expect(document.querySelector("audio")).toBeNull();
    expect(screen.getByTestId("ryo-decision-controls")).toBeTruthy();
  });

  it("renders the canonical audio player for an audio question, no image, controls unaffected", () => {
    render(
      <RyoGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "audio", url: "https://cdn/ryo.mp3" },
        })}
      />,
    );
    expect(screen.getByTestId("marhala-question-audio")).toBeTruthy();
    const audio = document.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("https://cdn/ryo.mp3");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByTestId("ryo-decision-controls")).toBeTruthy();
  });

  it("never renders hidden answer metadata alongside media", () => {
    render(
      <RyoGameplayPanel
        runtime={runtimeWithItem({
          media: { type: "image", url: "https://cdn/ryo.webp" },
          correctOptionId: "team-a",
        })}
      />,
    );
    expect(document.body.textContent).not.toContain("correctOptionId");
  });
});
