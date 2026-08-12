import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

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

const runtime = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  status: "round-active",
  revision: 1,
  mode: { key: "closest", version: 1, stateSchemaVersion: 1 },
  modeState: {
    currentItemJson: JSON.stringify({ id: "item-1", prompt: "السؤال" }),
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
} satisfies GameplayRuntimeSnapshot;

describe("Closest estimate input", () => {
  beforeEach(() => mocks.gameplayCommand.mockReset());

  it("clears the field immediately after submitting an estimate", () => {
    render(<ClosestGameplayPanel runtime={runtime} />);

    const input = screen.getByPlaceholderText("اكتب تقدير فريقك");
    fireEvent.change(input, { target: { value: "2007" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));

    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-estimate",
      payload: { value: 2007 },
    });
    expect(input).toHaveValue("");
  });

  it("does not carry an estimate into another item with the same question number", () => {
    const view = render(<ClosestGameplayPanel runtime={runtime} />);
    fireEvent.change(screen.getByPlaceholderText("اكتب تقدير فريقك"), {
      target: { value: "8" },
    });

    view.rerender(
      <ClosestGameplayPanel
        runtime={{
          ...runtime,
          runtimeId: "runtime-2",
          activeRound: { ...runtime.activeRound, id: "round-2" },
          modeState: {
            ...runtime.modeState,
            currentItemJson: JSON.stringify({
              id: "item-2",
              prompt: "سؤال جديد",
            }),
          },
        }}
      />,
    );

    expect(screen.getByPlaceholderText("اكتب تقدير فريقك")).toHaveValue("");
  });
});
