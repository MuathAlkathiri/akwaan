import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { OneClueGameplayPanel } from "@/features/live-game-session/components/one-clue-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * بدليل واحد on a player's phone.
 *
 * One Clue is different from Closest in one way that decides the whole design:
 * the clues *are* the question. A player answers from them, so the controller
 * keeps every clue the server sent — at controller scale — and drops only what
 * belongs to the room's screen.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

const runtimeWith = (state: Record<string, unknown> = {}) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "one-clue", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: ["mode:submit-one-clue-answer"],
    activeRound: { id: "round-1", sequence: 1, status: "active" },
    modeState: {
      phase: "collecting",
      currentItemIndex: 1,
      currentClueValue: 3,
      currentItemJson: JSON.stringify({
        id: "item-1",
        prompt: { ar: "مين هذا الممثل؟" },
        clues: [
          { order: 1, value: 5, text: { ar: "ولد في الرياض" } },
          { order: 2, value: 4, text: { ar: "اشتهر في التسعينات" } },
          { order: 3, value: 3, text: { ar: "له دور في مسلسل طاش" } },
        ],
      }),
      teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
      submissionStatusJson: JSON.stringify({
        "team-alpha": false,
        "team-beta": false,
      }),
      eliminatedTeamIdsJson: JSON.stringify([]),
      assignedParticipantIdsJson: JSON.stringify({
        "team-alpha": "p-1",
        "team-beta": "p-2",
      }),
      actorTeamId: "team-alpha",
      isAssignedActor: true,
      ownAssignmentSequence: 2,
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
  render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <MobileGameplayShell participantId="p-1">
        <OneClueGameplayPanel runtime={runtime} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { gameplayCommand };
};

const renderHost = (runtime = runtimeWith(), gameplayCommand = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <OneClueGameplayPanel runtime={runtime} />
    </LiveSessionContext.Provider>,
  );
  return { gameplayCommand };
};

const REVEALED = {
  phase: "revealed",
  revealedResultJson: JSON.stringify({
    correctAnswer: "ناصر القصبي",
    clueNumber: 3,
    answers: { "team-alpha": "ناصر القصبي", "team-beta": "عبدالله السدحان" },
    statuses: { "team-alpha": "correct", "team-beta": "wrong" },
    points: { "team-alpha": 3, "team-beta": 0 },
  }),
};

describe("One Clue is still a reachable mechanic", () => {
  it("is registered as a launcher the Match can actually start", () => {
    // Migrating a mechanic no board can launch would be dead UI, so this is
    // pinned in source rather than assumed from an old discussion.
    const wiring = readFileSync(
      resolve(process.cwd(), "../backend/src/modules/match/match.module.ts"),
      "utf8",
    );
    expect(wiring).toContain("OneClueChallengeLauncher");
  });

  it("is a declared production mechanic, not a retired one", () => {
    const definitions = readFileSync(
      resolve(
        process.cwd(),
        "../backend/src/modules/world-content/domain/production-mechanic.definition.ts",
      ),
      "utf8",
    );
    expect(definitions).toContain("ONE_CLUE_SLUG");
  });
});

describe("the phone is a controller", () => {
  it("keeps every clue, because the clues are the question", () => {
    renderPhone();
    const clues = screen.getByTestId("one-clue-revealed-clues");
    expect(within(clues).getAllByRole("listitem")).toHaveLength(3);
    expect(clues).toHaveTextContent("ولد في الرياض");
    expect(clues).toHaveTextContent("له دور في مسلسل طاش");
  });

  it("gives the answer a mobile-sized control and one send button", () => {
    renderPhone();
    const input = screen.getByTestId("one-clue-answer-input");
    expect(input.className).toContain("h-14");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("puts the lock button in the shared thumb action area", () => {
    renderPhone();
    const area = screen.getByTestId("mobile-action-area");
    expect(within(area).getByTestId("one-clue-submit")).toBeInTheDocument();
  });

  it("sends the mechanic's existing command, payload unchanged", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("one-clue-answer-input"), {
      target: { value: "  ناصر القصبي  " },
    });
    fireEvent.click(screen.getByTestId("one-clue-submit"));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-one-clue-answer",
      payload: { answer: "ناصر القصبي", assignmentSequence: 2 },
    });
  });

  it("holds a visible pending state until the server confirms the lock", () => {
    // Clearing the field already blocks a second command, so the pending guard
    // has to be observable in its own right — otherwise nothing distinguishes a
    // real in-flight state from an empty input.
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("one-clue-answer-input"), {
      target: { value: "ناصر" },
    });
    const send = screen.getByTestId("one-clue-submit");
    expect(send).toHaveTextContent("قفل الإجابة");
    fireEvent.click(send);
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("one-clue-submit")).toHaveTextContent(
      "جارٍ التثبيت…",
    );
    expect(screen.getByTestId("one-clue-submit")).toBeDisabled();
  });

  it("cannot be locked twice, by button or by Enter", () => {
    const { gameplayCommand } = renderPhone();
    const input = screen.getByTestId("one-clue-answer-input");
    fireEvent.change(input, { target: { value: "ناصر" } });
    fireEvent.click(screen.getByTestId("one-clue-submit"));
    fireEvent.click(screen.getByTestId("one-clue-submit"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
  });

  it("shows a submitted state driven by the server's own lock", () => {
    renderPhone(runtimeWith({ ownAnswerLocked: true }));
    const status = screen.getByTestId("one-clue-phone-status");
    expect(status).toHaveTextContent("تم تثبيت إجابتكم");
    expect(screen.queryByTestId("one-clue-answer-input")).toBeNull();
  });

  it("keeps the elimination message the mechanic already had", () => {
    renderPhone(
      runtimeWith({
        eliminatedTeamIdsJson: JSON.stringify(["team-alpha"]),
      }),
    );
    expect(screen.getByTestId("one-clue-phone-status")).toHaveTextContent(
      "إجابة غير صحيحة — خرجتم من هذا السؤال",
    );
  });

  it("uses the compact frame and one authoritative countdown", () => {
    renderPhone();
    const frame = screen.getByTestId("challenge-frame");
    expect(frame.innerHTML).toContain("px-4");
    expect(frame).toHaveTextContent("السؤال 2 من 3");
    expect(frame).not.toHaveTextContent("بدليل واحد");
    expect(screen.getAllByTestId("challenge-countdown")).toHaveLength(1);
  });

  it("carries no per-team status board", () => {
    renderPhone();
    expect(screen.getByTestId("challenge-frame")).not.toHaveTextContent(
      "صقور الرياض",
    );
  });

  it("reduces the reveal to the fact and this team's own points", () => {
    renderPhone(runtimeWith(REVEALED));
    const reveal = screen.getByTestId("one-clue-phone-reveal");
    expect(reveal).toHaveTextContent("ناصر القصبي");
    expect(reveal).toHaveTextContent("+3");
    // The opposing team's wrong guess stays on the room's screen.
    expect(reveal).not.toHaveTextContent("عبدالله السدحان");
  });
});

describe("privacy is unchanged: the phone gains nothing", () => {
  it("never carries the correct answer before the reveal", () => {
    renderPhone();
    expect(document.body.textContent).not.toContain("ناصر القصبي");
  });

  it("never carries the opponent's answer before the reveal", () => {
    renderPhone(
      runtimeWith({
        submissionStatusJson: JSON.stringify({
          "team-alpha": false,
          "team-beta": true,
        }),
      }),
    );
    expect(document.body.textContent).not.toContain("عبدالله السدحان");
  });

  it("does not show the opponent's answer even after the reveal", () => {
    renderPhone(runtimeWith(REVEALED));
    expect(document.body.textContent).not.toContain("عبدالله السدحان");
  });
});

describe("the host is untouched", () => {
  it("keeps the full prompt, the clue list and both team panels", () => {
    renderHost();
    expect(screen.getByRole("heading", { level: 2 }).className).toContain(
      "text-[2rem]",
    );
    expect(
      within(screen.getByTestId("one-clue-revealed-clues")).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(3);
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "بدليل واحد",
    );
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "صقور الرياض",
    );
  });

  it("keeps its non-compact frame and its full recap", () => {
    renderHost(runtimeWith(REVEALED));
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
    expect(document.body.textContent).toContain("عبدالله السدحان");
    expect(screen.queryByTestId("one-clue-phone-reveal")).toBeNull();
  });

  it("renders no phone action area", () => {
    renderHost();
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
  });

  it("still submits with the same command from the host surface", () => {
    const { gameplayCommand } = renderHost();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "ناصر" },
    });
    fireEvent.click(screen.getByTestId("one-clue-submit"));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-one-clue-answer",
      payload: { answer: "ناصر", assignmentSequence: 2 },
    });
  });
});
