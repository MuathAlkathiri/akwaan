import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  error: undefined as unknown,
  nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
}));

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "team-alpha", name: "ألفا" },
        { id: "team-beta", name: "بيتا" },
      ],
    },
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
    error: mocks.error,
    nowMs: mocks.nowMs,
  }),
}));

import { DistributedInformationPanel } from "@/features/live-game-session/components/distributed-information-panel";
import { DistributedInformationScreen } from "@/features/live-game-session/components/distributed-information-screen";
import {
  describeDistributedError,
  previewDistribution,
  remainingLockSeconds,
  teamStatus,
} from "@/features/live-game-session/match/distributed-information.presentation";

const DEADLINE = "2026-01-01T00:02:15.000Z";

/** The public race half of the projection, shared by every actor. */
const publicState = (
  overrides: Record<string, string | number | boolean | null> = {},
) => ({
  variant: "three-segment-race",
  phase: "active",
  puzzleCount: 3,
  deadlineAt: DEADLINE,
  progressJson: JSON.stringify([
    { teamId: "team-alpha", solved: 1, wrongAttempts: 1, locked: 0 },
    { teamId: "team-beta", solved: 2, wrongAttempts: 0, locked: 0 },
  ]),
  ...overrides,
});

/** What one participant's phone receives, as the server builds it. */
const participantState = (
  overrides: Record<string, string | number | boolean | null> = {},
) => ({
  ...publicState(),
  myTeamId: "team-alpha",
  myTeamFinished: false,
  contentItemId: "item-2",
  publicPrompt: "من هو اللاعب؟",
  puzzlePosition: 2,
  mySolved: 1,
  myLockUntil: 0,
  isAnswerer: true,
  answerMode: "match",
  optionsJson: null,
  mySegmentsJson: JSON.stringify([
    { id: "B", content: "كرة ذهبية واحدة" },
  ]),
  ...overrides,
});

const runtime = (modeState: Record<string, unknown>) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 4,
    mode: { key: "distributed-information", version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: { id: "round-1", status: "active" },
    availableActions: [],
  }) as never;

describe("distributed-information phone panel", () => {
  it("shows the public prompt and only this participant's own segment", () => {
    render(<DistributedInformationPanel runtime={runtime(participantState())} />);

    expect(screen.getByText("من هو اللاعب؟")).toBeTruthy();
    const privateBox = screen.getByLabelText("معلوماتك الخاصة");
    expect(within(privateBox).getByText("كرة ذهبية واحدة")).toBeTruthy();
    expect(
      screen.getByText("معلوماتك الخاصة — لا تعرض شاشتك"),
    ).toBeTruthy();
    // Only what the server sent: no teammate and no opponent segment exists.
    expect(document.body.textContent).not.toContain("لعب في إسبانيا");
    expect(document.body.textContent).not.toContain("اعتزل");
  });

  it("states the puzzle position and both teams' progress from the snapshot", () => {
    render(<DistributedInformationPanel runtime={runtime(participantState())} />);

    expect(screen.getByText("اللغز 2 من 3")).toBeTruthy();
    expect(screen.getByText("فريقك: 1/3")).toBeTruthy();
    expect(screen.getByText("الخصم: 2/3")).toBeTruthy();
    // 135s race started at :00, now is :10 → 125 left, from the server stamp.
    expect(screen.getByText("الوقت المتبقي: 125 ثانية")).toBeTruthy();
  });

  it("gives the answerer an input and submits the real gameplay command", async () => {
    const user = userEvent.setup();
    mocks.gameplayCommand.mockClear();
    render(<DistributedInformationPanel runtime={runtime(participantState())} />);

    expect(screen.getByText("أنت المجيب في هذا اللغز")).toBeTruthy();
    await user.type(screen.getByLabelText("إجابتك"), "ميسي");
    await user.click(screen.getByRole("button", { name: "إرسال الإجابة" }));

    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-answer",
      // The puzzle identity travels with the answer so a stale one is refused.
      payload: { contentItemId: "item-2", answer: "ميسي" },
    });
  });

  it("gives a non-answerer no input at all", () => {
    render(
      <DistributedInformationPanel
        runtime={runtime(participantState({ isAnswerer: false }))}
      />,
    );

    expect(screen.queryByLabelText("إجابتك")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "إرسال الإجابة" }),
    ).toBeNull();
    expect(screen.getByText("ناقش معلوماتك مع فريقك")).toBeTruthy();
    expect(screen.getByText("والمجيب سيرسل الإجابة")).toBeTruthy();
  });

  it("renders multiple choice options without the correct one being marked", () => {
    render(
      <DistributedInformationPanel
        runtime={runtime(
          participantState({
            answerMode: "multiple_choice",
            optionsJson: JSON.stringify([
              { id: "a", label: "الأول" },
              { id: "b", label: "الثاني" },
            ]),
          }),
        )}
      />,
    );

    expect(screen.getByRole("button", { name: "الأول" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الثاني" })).toBeTruthy();
    // The server never sends correctOptionId to a phone.
    expect(document.body.textContent).not.toContain("correctOptionId");
  });

  it("counts the five-second lock down from the server stamp", () => {
    render(
      <DistributedInformationPanel
        runtime={runtime(
          participantState({ myLockUntil: mocks.nowMs + 3_000 }),
        )}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("إجابة غير صحيحة");
    expect(alert.textContent).toContain("حاولوا مجددًا بعد 3");
    // Input stays present for the answerer but cannot be submitted.
    expect(
      screen.getByRole("button", { name: "إرسال الإجابة" }),
    ).toBeDisabled();
  });

  it("advances with the authoritative snapshot rather than counting locally", () => {
    const { rerender } = render(
      <DistributedInformationPanel runtime={runtime(participantState())} />,
    );
    expect(screen.getByText("اللغز 2 من 3")).toBeTruthy();

    rerender(
      <DistributedInformationPanel
        runtime={runtime(
          participantState({
            puzzlePosition: 3,
            mySolved: 2,
            contentItemId: "item-3",
            publicPrompt: "أي نادٍ؟",
            mySegmentsJson: JSON.stringify([
              { id: "C", content: "تأسس 1899" },
            ]),
          }),
        )}
      />,
    );

    expect(screen.getByText("اللغز 3 من 3")).toBeTruthy();
    expect(screen.getByText("أي نادٍ؟")).toBeTruthy();
    expect(screen.getByText("تأسس 1899")).toBeTruthy();
  });

  it("restores exactly the same private view on a resync", () => {
    const state = participantState();
    const { container, rerender } = render(
      <DistributedInformationPanel runtime={runtime(state)} />,
    );
    const before = container.innerHTML;

    rerender(<DistributedInformationPanel runtime={runtime({ ...state })} />);

    expect(container.innerHTML).toBe(before);
  });

  it("waits without inventing a winner once its own team finishes", () => {
    render(
      <DistributedInformationPanel
        runtime={runtime(participantState({ myTeamFinished: true }))}
      />,
    );

    expect(
      screen.getByText(/أنهى فريقك كل الألغاز/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("فزتم");
  });

  it("localizes a stale-puzzle refusal in Arabic", () => {
    mocks.error = { code: "DISTRIBUTED_STALE_PUZZLE", message: "stale" };
    render(<DistributedInformationPanel runtime={runtime(participantState())} />);

    expect(
      screen.getByText("انتقل فريقك إلى لغز آخر. جرّب اللغز الحالي."),
    ).toBeTruthy();
    // A backend code is never the primary copy.
    expect(document.body.textContent).not.toContain("DISTRIBUTED_STALE_PUZZLE");
    mocks.error = undefined;
  });
});

describe("distributed-information shared screen", () => {
  it("shows both teams racing with progress and status", () => {
    render(<DistributedInformationScreen runtime={runtime(publicState())} />);

    expect(screen.getByText("ركّبها")).toBeTruthy();
    expect(screen.getByText("ألفا")).toBeTruthy();
    expect(screen.getByText("بيتا")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getAllByText("يحل اللغز")).toHaveLength(2);
  });

  it("indicates a locked team without showing what was attempted", () => {
    render(
      <DistributedInformationScreen
        runtime={runtime(
          publicState({
            progressJson: JSON.stringify([
              {
                teamId: "team-alpha",
                solved: 1,
                wrongAttempts: 1,
                locked: mocks.nowMs + 4_000,
              },
              { teamId: "team-beta", solved: 2, wrongAttempts: 0, locked: 0 },
            ]),
          }),
        )}
      />,
    );

    expect(screen.getByText("مقفل مؤقتًا")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ميسي");
  });

  it("never shows a segment, an answerer, or an answer", () => {
    render(<DistributedInformationScreen runtime={runtime(publicState())} />);

    const serialized = document.body.textContent ?? "";
    for (const secret of [
      "كرة ذهبية",
      "لعب في إسبانيا",
      "ميسي",
      "المجيب",
      "معلوماتك الخاصة",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("announces the winner and the single Match point on completion", () => {
    render(
      <DistributedInformationScreen
        runtime={runtime(
          publicState({
            phase: "completed",
            resultJson: JSON.stringify({
              winnerTeamId: "team-beta",
              tie: false,
            }),
          }),
        )}
      />,
    );

    expect(screen.getByText("فاز بيتا")).toBeTruthy();
    expect(screen.getByText("+1 نقطة مباراة")).toBeTruthy();
  });

  it("announces a tie with no point", () => {
    render(
      <DistributedInformationScreen
        runtime={runtime(
          publicState({
            phase: "completed",
            resultJson: JSON.stringify({ winnerTeamId: null, tie: true }),
          }),
        )}
      />,
    );

    expect(screen.getByText("تعادل — لا نقطة لأي فريق")).toBeTruthy();
    expect(document.body.textContent).not.toContain("+1 نقطة مباراة");
  });
});

describe("distributed-information presentation helpers", () => {
  it("derives the lock countdown and the race clock from server stamps", () => {
    expect(remainingLockSeconds(mocks.nowMs + 4_200, mocks.nowMs)).toBe(5);
    expect(remainingLockSeconds(0, mocks.nowMs)).toBe(0);
    // A stamp in the past never produces a negative countdown.
    expect(remainingLockSeconds(mocks.nowMs - 1_000, mocks.nowMs)).toBe(0);
  });

  it("reports a team as solving, locked, or finished", () => {
    const entry = { teamId: "t", solved: 1, wrongAttempts: 0, locked: 0 };
    expect(teamStatus(entry, mocks.nowMs)).toBe("solving");
    expect(teamStatus({ ...entry, locked: mocks.nowMs + 1 }, mocks.nowMs)).toBe(
      "locked",
    );
    expect(teamStatus({ ...entry, solved: 3 }, mocks.nowMs)).toBe("finished");
  });

  it("previews one segment each for three players and a 2+1 merge for two", () => {
    const merge = {
      firstParticipantSegmentIds: ["A", "C"],
      secondParticipantSegmentIds: ["B"],
    };
    expect(previewDistribution(3, merge)).toEqual([["A"], ["B"], ["C"]]);
    expect(previewDistribution(2, merge)).toEqual([["A", "C"], ["B"]]);
  });

  it("falls back to readable Arabic for an unknown refusal", () => {
    expect(describeDistributedError({ code: "SOMETHING_NEW" })).toBe(
      "تعذّر تنفيذ الإجراء. حاول مرة أخرى.",
    );
  });
});
