import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import {
  BombHolderSetup,
  bombHolderSetupPending,
} from "@/features/live-game-session/components/bomb-holder-setup";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * Bomb's initial holders: the captain chooses (themselves included), a team
 * without a captain was assigned automatically, and the room's screen shows
 * both teams and keeps its start control disabled until both are ready.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-a", name: "الأزرق", active: true },
  { id: "team-b", name: "الأحمر", active: true },
];
const PEOPLE = [
  ["a1", "سارة", "team-a", true],
  ["a2", "خالد", "team-a", true],
  ["a3", "نورة", "team-a", false],
  ["b1", "فهد", "team-b", true],
].map(([id, displayName, teamId, connected]) => ({
  id,
  displayName,
  teamId,
  role: "team-player",
  connected,
}));
const setup = (holderA: string | null = null) =>
  JSON.stringify({
    teams: [
      {
        teamId: "team-a",
        captainParticipantId: "a2",
        holderParticipantId: holderA,
        autoAssigned: false,
      },
      {
        teamId: "team-b",
        captainParticipantId: null,
        holderParticipantId: "b1",
        autoAssigned: true,
      },
    ],
  });
const runtime = (holderA: string | null = null) =>
  ({
    runtimeId: "r1",
    sessionId: "s1",
    revision: 3,
    mode: { key: "bomb", version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    availableActions: [],
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState: { awaitingPresentation: true },
    },
    modeState: { awaitingPresentation: true, holderSetupJson: setup(holderA) },
  }) as unknown as GameplayRuntimeSnapshot;

const mount = (
  actor: "shared-screen" | "participant",
  me?: string,
  holderA: string | null = null,
  people = PEOPLE,
) => {
  const gameplayCommand = vi.fn();
  const context = {
    snapshot: {
      sessionId: "s1",
      revision: 9,
      teams: TEAMS,
      participants: people,
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
  } as never;
  const view = <BombHolderSetup runtime={runtime(holderA)} actor={actor} />;
  render(
    <LiveSessionContext.Provider value={context}>
      {actor === "participant" ? (
        <MobileGameplayShell participantId={me}>{view}</MobileGameplayShell>
      ) : (
        view
      )}
    </LiveSessionContext.Provider>,
  );
  return gameplayCommand;
};

describe("the room's screen", () => {
  it("shows both teams, who holds each bomb, and which team is still choosing", () => {
    mount("shared-screen");
    const a = screen.getByTestId("bomb-holder-team-team-a");
    const b = screen.getByTestId("bomb-holder-team-team-b");
    expect(a).toHaveAttribute("data-ready", "false");
    expect(a).toHaveTextContent("القائد: خالد");
    expect(a).toHaveTextContent("ينتظر اختيار القائد");
    expect(b).toHaveAttribute("data-ready", "true");
    expect(b).toHaveTextContent("القنبلة مع فهد");
    expect(b).toHaveTextContent("بدون قائد — اختيار تلقائي بالتناوب");
    // Readiness in words, not by colour or icon alone.
    expect(
      screen.getByTestId("bomb-holder-readiness-team-a"),
    ).toHaveTextContent("ما بعد اختار");
    expect(
      screen.getByTestId("bomb-holder-readiness-team-b"),
    ).toHaveTextContent("جاهز");
  });

  it("keeps Start Challenge disabled until both teams are ready", () => {
    mount("shared-screen");
    expect(screen.getByTestId("bomb-holder-start")).toBeDisabled();
    expect(screen.getByTestId("bomb-holder-start")).toHaveTextContent(
      "ننتظر الفريقين",
    );
  });

  it("enables Start Challenge once both are ready, and sends it once", () => {
    const command = mount("shared-screen", undefined, "a1");
    const start = screen.getByTestId("bomb-holder-start");
    expect(start).toBeEnabled();
    expect(start).toHaveTextContent("ابدأ التحدي");
    fireEvent.click(start);
    fireEvent.click(start);
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "start-bomb-challenge",
      payload: {},
    });
  });

  it("stays on the setup when ready, and leaves it once started", () => {
    expect(bombHolderSetupPending({ holderSetupJson: setup() })).toBe(true);
    // READY is not started.
    expect(bombHolderSetupPending({ holderSetupJson: setup("a1") })).toBe(true);
    const started = JSON.stringify({
      ...JSON.parse(setup("a1")),
      startedAt: "2026-11-15T12:00:00.000Z",
    });
    expect(bombHolderSetupPending({ holderSetupJson: started })).toBe(false);
    expect(bombHolderSetupPending({ awaitingPresentation: true })).toBe(false);
  });
});

describe("the captain's phone", () => {
  it("lists connected teammates, the captain included, and sends the choice", () => {
    const command = mount("participant", "a2");
    expect(screen.getByTestId("bomb-holder-picker")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-holder-option-a2")).toHaveTextContent(
      "أنا",
    );
    // Away players are not offered.
    expect(screen.queryByTestId("bomb-holder-option-a3")).toBeNull();
    // The other team is never offered.
    expect(screen.queryByTestId("bomb-holder-option-b1")).toBeNull();
    fireEvent.click(screen.getByTestId("bomb-holder-option-a1"));
    expect(command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "choose-bomb-holder",
      payload: { participantId: "a1" },
    });
  });
});

describe("everyone else's phone", () => {
  it("tells a teammate whose choice it is", () => {
    mount("participant", "a1");
    expect(screen.queryByTestId("bomb-holder-picker")).toBeNull();
    expect(screen.getByTestId("bomb-holder-waiting")).toHaveTextContent(
      "الاختيار عند خالد",
    );
  });

  it("tells an auto-assigned team who holds its bomb", () => {
    mount("participant", "b1");
    expect(screen.getByTestId("bomb-holder-waiting")).toHaveTextContent(
      "القنبلة مع فهد",
    );
  });

  it("tells a ready team it is waiting for the host", () => {
    mount("participant", "a1", "a1");
    expect(screen.getByTestId("bomb-holder-waiting")).toHaveTextContent(
      "ننتظر المضيف يبدأ التحدي",
    );
  });

  it("lets a teammate choose while the captain is away", () => {
    const captainAway = PEOPLE.map((p) =>
      p.id === "a2" ? { ...p, connected: false } : p,
    );
    mount("participant", "a1", null, captainAway);
    expect(screen.getByTestId("bomb-holder-picker")).toBeInTheDocument();
  });
});
