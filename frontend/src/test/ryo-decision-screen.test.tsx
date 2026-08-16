import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * The most important screen in the game.
 *
 * Read Your Opponent's payoff matrix is mathematically symmetric — Steal and Trust
 * each win a point in one branch and concede one in the other. The screen therefore
 * has to present them as *equally weighted*. Any visual bias toward one option is not
 * a styling preference: it tells players which choice the designer prefers, they take
 * it, and the bluffing layer the whole mechanic rests on stops existing.
 *
 * These assertions are the ones that failed on the shipped build:
 *   - Steal was `destructive` red ("danger, don't") and Trust was filled navy
 *     ("safe default").
 *   - The clock was a small grey chip in the header, in a ten-second blind window.
 *   - Locking in had no per-team indicator, so nobody could see the opponent commit.
 */
const TEAMS = [
  { id: "team-a", name: "صقور الرياض", active: true },
  { id: "team-b", name: "نجوم جدة", active: true },
];

vi.mock("@/features/live-game-session/hooks/live-session-clock-context", () => ({
  useLiveSessionClock: () => Date.parse("2026-08-07T00:00:00.000Z"),
}));

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      sessionId: "session-1",
      serverTimestamp: "2026-08-07T00:00:00.000Z",
      teams: TEAMS,
      participants: [],
    },
    gameplayCommand: vi.fn(),
    connection: "connected",
    snapshotReceivedAtMs: Date.parse("2026-08-07T00:00:00.000Z"),
  }),
}));

/** The blind window, from the point of view of one of the two acting phones. */
function ryoRuntime(options: {
  role: "answering" | "opposing";
  submissions?: Array<{ kind: string }>;
  secondsLeft?: number;
}): GameplayRuntimeSnapshot {
  const deadline = new Date(
    Date.parse("2026-08-07T00:00:00.000Z") + (options.secondsLeft ?? 10) * 1000,
  ).toISOString();
  return {
    runtimeId: "runtime-1",
    mode: { key: "read-your-opponent", version: 1 },
    status: "active",
    modeState: { currentItemIndex: 0 },
    transitions: [],
    availableActions: ["submission:create"],
    activeRound: {
      id: "round-1",
      number: 1,
      status: "active",
      activeTeamId: "team-a",
      modeState: { answeringTeamId: "team-a", opposingTeamId: "team-b" },
      interaction: {
        interactionId: "interaction-1",
        status: "open",
        prompt: {
          deadlineAt: deadline,
          payload: {
            itemJson: JSON.stringify({
              id: "item-1",
              prompt: { ar: "في أي سنة تأسس النادي؟" },
              answerMode: "multiple_choice",
              options: [
                { id: "option-1", label: { ar: "1957" } },
                { id: "option-2", label: { ar: "1976" } },
              ],
            }),
            actorRole: options.role,
            answeringTeamId: "team-a",
            opposingTeamId: "team-b",
            isAssignedActor: true,
          },
        },
        // The server projects that a submission exists and its kind, never the
        // choice inside it.
        submissions: (options.submissions ?? []).map((submission, index) => ({
          id: `submission-${index}`,
          status: "pending-adjudication",
          payload: { kind: submission.kind },
          receivedAt: "2026-08-07T00:00:05.000Z",
        })),
      },
    },
  } as unknown as GameplayRuntimeSnapshot;
}

describe("the Steal / Trust decision", () => {
  it("weights the two options identically, differing only by icon and label", () => {
    render(<RyoGameplayPanel runtime={ryoRuntime({ role: "opposing" })} />);

    const controls = screen.getByTestId("ryo-decision-controls");
    const buttons = Array.from(controls.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);

    // Same class list means same border weight, fill, size and padding — the whole
    // acceptance criterion, checked mechanically rather than by eye.
    expect(buttons[0].className).toBe(buttons[1].className);
    expect(new Set(buttons.map((button) => button.dataset.decision))).toEqual(
      new Set(["trust", "steal"]),
    );
  });

  it("gives neither option a semantic colour or a filled emphasis", () => {
    render(<RyoGameplayPanel runtime={ryoRuntime({ role: "opposing" })} />);

    for (const button of screen
      .getByTestId("ryo-decision-controls")
      .querySelectorAll("button")) {
      // Nothing on this screen is correct or wrong yet, so nothing may be green,
      // red, or a filled dark "safe default".
      for (const banned of [
        "sem-success",
        "sem-error",
        "destructive",
        "bg-success",
        "bg-primary",
      ]) {
        expect(button.className).not.toContain(banned);
      }
    }
  });

  it("addresses the team in the plural", () => {
    render(<RyoGameplayPanel runtime={ryoRuntime({ role: "opposing" })} />);
    // A team is plural: "أثق بإجابته" spoke to one player about one player.
    expect(screen.getByText("نثق بإجابتكم")).toBeTruthy();
    expect(document.body.textContent).not.toContain("أثق بإجابته");
  });
});

describe("the blind window's clock", () => {
  it("renders the seconds prominently, in tabular numerals, below the question", () => {
    render(<RyoGameplayPanel runtime={ryoRuntime({ role: "opposing" })} />);

    const countdown = screen.getByTestId("challenge-countdown");
    expect(countdown.getAttribute("role")).toBe("timer");
    // Without tabular numerals the digits change width every tick and the most
    // watched element on the screen visibly jitters.
    const numeral = countdown.querySelector(".akwaan-numeral");
    expect(numeral?.textContent).toBe("10");
    expect(countdown.className).toContain("flex-col");

    // Second-largest, not largest. Measured in a browser, the clock at `text-6xl`
    // rendered 72px against a 40px question and the room read the timer first — so
    // the two scales are asserted against each other rather than pinned separately.
    const scaleOf = (className: string) =>
      Number(
        className.match(/text-(?:\[(\d+(?:\.\d+)?)rem\]|(\d)xl)/)?.slice(1).find(Boolean),
      );
    const question = screen.getByRole("heading", { level: 2 });
    // The question is written in rem, the timer on Tailwind's xl scale; both parse to
    // a comparable number only because the timer's tier is deliberately low.
    expect(question.className).toMatch(/text-\[2rem\]/);
    expect(numeral?.className).toMatch(/text-3xl/);
    expect(scaleOf(numeral?.className ?? "")).toBeLessThan(4);
  });

  it("escalates to gold and then to the error red in the last three seconds", () => {
    const urgencyAt = (secondsLeft: number) => {
      const view = render(
        <RyoGameplayPanel runtime={ryoRuntime({ role: "opposing", secondsLeft })} />,
      );
      const urgency = screen.getByTestId("challenge-countdown").dataset.urgency;
      view.unmount();
      return urgency;
    };

    // 6s, not 10s: RYO's window *is* ten seconds, so a 10s threshold meant the clock
    // was amber for the entire window and never escalated from anything.
    expect(urgencyAt(30)).toBe("calm");
    expect(urgencyAt(10)).toBe("calm");
    expect(urgencyAt(6)).toBe("warning");
    expect(urgencyAt(3)).toBe("critical");
  });
});

describe("the per-team lock indicators", () => {
  it("shows one per team, both visible to both sides", () => {
    render(<RyoGameplayPanel runtime={ryoRuntime({ role: "opposing" })} />);

    const answering = screen.getByTestId("ryo-lock-answering");
    const opposing = screen.getByTestId("ryo-lock-opposing");
    expect(answering.textContent).toContain("صقور الرياض");
    expect(opposing.textContent).toContain("نجوم جدة");
    expect(answering.dataset.locked).toBe("false");
    expect(opposing.dataset.locked).toBe("false");
  });

  it("flips each side independently, the instant that side submits", () => {
    render(
      <RyoGameplayPanel
        runtime={ryoRuntime({
          role: "opposing",
          submissions: [{ kind: "answer" }],
        })}
      />,
    );

    // The answering team has committed and the opposing team has not: watching
    // exactly this happen is the mechanic.
    expect(screen.getByTestId("ryo-lock-answering").dataset.locked).toBe("true");
    expect(screen.getByTestId("ryo-lock-opposing").dataset.locked).toBe("false");
  });

  it("never carries the other side's choice, only that it was made", () => {
    render(
      <RyoGameplayPanel
        runtime={ryoRuntime({
          role: "answering",
          submissions: [{ kind: "decision" }],
        })}
      />,
    );

    expect(screen.getByTestId("ryo-lock-opposing").dataset.locked).toBe("true");
    for (const leak of ["steal", "trust", "سرقة", "ثقة"]) {
      expect(document.body.textContent?.includes(leak)).toBe(false);
    }
  });

  it("stops offering this phone its controls once it has locked in, not when its opponent does", () => {
    render(
      <RyoGameplayPanel
        runtime={ryoRuntime({
          role: "opposing",
          submissions: [{ kind: "answer" }],
        })}
      />,
    );

    // The opponent's submission is public now, so "already submitted" has to be
    // read off this side's own kind or a phone loses its buttons to the other team.
    expect(screen.queryByTestId("ryo-decision-controls")).not.toBeNull();
  });
});
