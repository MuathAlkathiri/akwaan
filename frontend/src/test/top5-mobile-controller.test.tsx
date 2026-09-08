import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { Top5Panel } from "@/features/live-game-session/components/top5-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * أفضل 5 on a player's phone.
 *
 * Top-5 is keep-or-give, not a ranking exercise (§23.3). The whole design rests
 * on the player *not* knowing whether the name in front of them is really in the
 * top five — so the sharpest assertions here are about what must never appear.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

/** Everything the roadmap says stays hidden metadata before the reveal. */
const FORBIDDEN = ["260 هدف", "#1", "المركز الأول", "الهداف التاريخي", "2024"];

const runtimeWith = (
  round: Record<string, unknown> = {},
  actions: string[] = ["mode:decide-card"],
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "top-5", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    modeState: {
      title: "أكثر 5 لاعبين تسجيلًا للأهداف في تاريخ البريميرليغ",
      ownershipJson: JSON.stringify([
        {
          turn: 1,
          entryId: "e-9",
          label: "واين روني",
          actingTeamId: "team-alpha",
          ownerTeamId: "team-beta",
          action: "give",
          resolutionReason: "submitted",
        },
      ]),
    },
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState: {
        phase: "deciding",
        cardNumber: 3,
        cardCount: 10,
        activeTeamId: "team-alpha",
        activeParticipantId: "p-1",
        assignmentSequence: 4,
        currentCardJson: JSON.stringify({
          id: "e-1",
          label: "ألان شيرر",
        }),
        ...round,
      },
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
  render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <MobileGameplayShell participantId="p-1">
        <Top5Panel runtime={runtime} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { gameplayCommand };
};

const renderHost = (runtime = runtimeWith(), gameplayCommand = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <Top5Panel runtime={runtime} />
    </LiveSessionContext.Provider>,
  );
  return { gameplayCommand };
};

describe("Top-5 is still a reachable mechanic", () => {
  it("is registered as a launcher the Match can start", () => {
    const wiring = readFileSync(
      resolve(process.cwd(), "../backend/src/modules/match/match.module.ts"),
      "utf8",
    );
    expect(wiring).toContain("Top5ChallengeLauncher");
  });
});

describe("the phone is a decision controller", () => {
  it("makes the candidate the focal point", () => {
    renderPhone();
    const card = screen.getByTestId("top5-current-card");
    expect(card).toHaveTextContent("ألان شيرر");
    expect(card.className).toContain("text-3xl");
  });

  it("offers exactly two peer decisions in the thumb area", () => {
    renderPhone();
    const area = screen.getByTestId("mobile-action-area");
    expect(within(area).getByTestId("top5-keep")).toBeInTheDocument();
    expect(within(area).getByTestId("top5-give")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("dresses neither decision as the dangerous one", () => {
    renderPhone();
    const keep = screen.getByTestId("top5-keep");
    const give = screen.getByTestId("top5-give");
    // Both are legitimate plays, so they carry the same weight.
    expect(give.className).not.toContain("destructive");
    expect(keep.className).toBe(give.className);
  });

  it("sends the mechanic's exact command for احتفظ", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.click(screen.getByTestId("top5-keep"));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "decide-card",
      payload: { action: "keep", assignmentSequence: 4 },
    });
  });

  it("sends the mechanic's exact command for دسّها", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.click(screen.getByTestId("top5-give"));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "decide-card",
      payload: { action: "give", assignmentSequence: 4 },
    });
  });

  it("cannot send both decisions for one card", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.click(screen.getByTestId("top5-keep"));
    fireEvent.click(screen.getByTestId("top5-give"));
    fireEvent.click(screen.getByTestId("top5-keep"));
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        payload: expect.objectContaining({ action: "keep" }),
      }),
    );
  });

  it("shows a pending state and disables both decisions while sending", () => {
    renderPhone();
    fireEvent.click(screen.getByTestId("top5-give"));
    expect(screen.getByTestId("top5-keep")).toBeDisabled();
    expect(screen.getByTestId("top5-give")).toBeDisabled();
    expect(screen.getByTestId("top5-decider-controls").parentElement)
      .toHaveTextContent("جارٍ إرسال قراركم…");
  });

  it("offers no decision at all when the server did not authorize this actor", () => {
    renderPhone(runtimeWith({}, []));
    expect(screen.queryByTestId("top5-keep")).toBeNull();
    expect(screen.queryByTestId("top5-give")).toBeNull();
    expect(screen.getByTestId("top5-waiting")).toHaveTextContent(
      "مُعاذ هو صاحب القرار",
    );
  });

  it("uses the compact frame and drops the room's card history", () => {
    renderPhone();
    const frame = screen.getByTestId("challenge-frame");
    expect(frame.innerHTML).toContain("px-4");
    expect(frame).not.toHaveTextContent("البطاقات الموزّعة");
    expect(frame).not.toHaveTextContent("أفضل 5");
  });
});

describe("the keep-or-give contract holds: entity name only", () => {
  it("renders the candidate name and nothing attached to it", () => {
    renderPhone();
    expect(screen.getByTestId("top5-current-card").textContent?.trim()).toBe(
      "ألان شيرر",
    );
  });

  it.each(FORBIDDEN)("never shows hidden metadata like %s", (secret) => {
    // Injected into the runtime the way a careless projection change would.
    renderPhone(
      runtimeWith({
        currentCardJson: JSON.stringify({ id: "e-1", label: "ألان شيرر" }),
        hiddenRank: 1,
        hiddenMetric: secret,
        cutoffDate: secret,
        evidence: secret,
      }),
    );
    expect(document.body.textContent).not.toContain(secret);
  });

  it("never shows a future candidate", () => {
    renderPhone(
      runtimeWith({
        deckJson: JSON.stringify(["e-1", "e-2"]),
        nextCardLabel: "تييري هنري",
      }),
    );
    expect(document.body.textContent).not.toContain("تييري هنري");
  });

  it("never says whether the candidate really belongs in the five", () => {
    renderPhone(runtimeWith({ isRealTop5: true, inclusionTruth: "real" }));
    expect(document.body.textContent).not.toContain("real");
    expect(screen.queryByTestId("top5-current-card")?.textContent).toBe(
      "ألان شيرر",
    );
  });
});

describe("the host is untouched", () => {
  it("keeps the eyebrow, the card chrome and the distributed-cards history", () => {
    renderHost();
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent("أفضل 5");
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "البطاقات الموزّعة",
    );
    expect(screen.getByTestId("top5-current-card").className).toContain(
      "md:text-4xl",
    );
  });

  it("keeps its non-compact frame and its own decision styling", () => {
    renderHost();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
  });

  it("still guards the host against a double decision", () => {
    const { gameplayCommand } = renderHost();
    fireEvent.click(screen.getByTestId("top5-keep"));
    fireEvent.click(screen.getByTestId("top5-give"));
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
  });

  it("keeps the host's completed hand-off to the shared result", () => {
    renderHost(runtimeWith({ phase: "completed" }));
    expect(screen.getByTestId("top5-awaiting-result")).toBeInTheDocument();
  });
});

describe("the phone hands the reveal back to the shared screen", () => {
  it("shows only a hand-off once the cards are done", () => {
    renderPhone(runtimeWith({ phase: "completed" }));
    expect(screen.getByTestId("top5-awaiting-result")).toBeInTheDocument();
    // No ranking, no per-entry breakdown: that is the room's screen, and then
    // the universal Challenge Complete state.
    expect(screen.queryByTestId("top5-current-card")).toBeNull();
    expect(screen.queryByTestId("top5-keep")).toBeNull();
  });
});
