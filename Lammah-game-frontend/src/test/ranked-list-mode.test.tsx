import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RankedListRoundStateResponseDto } from "@/api/generated/models";
import {
  getRankedListSecondsRemaining,
  RankedListRoundView,
} from "@/features/games/components/ranked-list-round";
import {
  createDefaultRankedListEntries,
  normalizeRankedListAnswer,
  validateRankedListEntries,
} from "@/features/questions/models/ranked-list-form";

const createState = (
  status: "active" | "completed" = "active",
): RankedListRoundStateResponseDto => ({
  questionId: "question-1",
  status,
  activeTeamId: "team-a",
  activeTeamIndex: 0,
  turnStartedAt: "2026-07-23T00:00:00.000Z",
  turnExpiresAt: "2026-07-23T00:00:15.000Z",
  turnSequence: 1,
  turnDurationSeconds: 15,
  maxStrikesPerTeam: 3,
  teams: [
    {
      teamId: "team-a",
      teamIndex: 0,
      name: "الأول",
      strikes: 1,
      temporaryScore: 40,
      eliminated: false,
    },
    {
      teamId: "team-b",
      teamIndex: 1,
      name: "الثاني",
      strikes: 0,
      temporaryScore: 0,
      eliminated: false,
    },
  ],
  entries: createDefaultRankedListEntries().map((entry, index) => ({
    id: `entry-${index}`,
    rank: entry.rank,
    points: entry.points,
    revealed: index === 0 || status === "completed",
    answer: index === 0 || status === "completed" ? `إجابة ${index + 1}` : undefined,
  })),
  outcome:
    status === "completed"
      ? {
          type: "winner",
          winnerTeamId: "team-a",
          awardedPointsByTeam: { "team-a": 40, "team-b": 0 },
        }
      : undefined,
});

const renderView = (state = createState()) =>
  render(
    <RankedListRoundView
      question="اذكر أعلى عشرة"
      state={state}
      secondsRemaining={9}
      answer=""
      onAnswerChange={vi.fn()}
      onSubmit={vi.fn()}
      onContinue={vi.fn()}
    />,
  );

describe("Top 10 ranked-list mode", () => {
  it("uses the exact normalization policy for Arabic and leading English articles", () => {
    expect(normalizeRankedListAnswer("  الإِجَابَة! ")).toBe("اجابه");
    expect(normalizeRankedListAnswer("The Lionel Messi")).toBe("lionel messi");
  });

  it("derives the countdown from the backend turn expiry timestamp", () => {
    expect(
      getRankedListSecondsRemaining(
        "2026-07-23T00:00:15.000Z",
        new Date("2026-07-23T00:00:05.500Z").getTime(),
      ),
    ).toBe(10);
    expect(
      getRankedListSecondsRemaining(
        "2026-07-23T00:00:15.000Z",
        new Date("2026-07-23T00:00:16.000Z").getTime(),
      ),
    ).toBe(0);
  });

  it("requires ten entries worth exactly 600 points", () => {
    const entries = createDefaultRankedListEntries();
    expect(validateRankedListEntries(entries)).toContain(
      "الإجابة الأساسية مطلوبة للمرتبة 1.",
    );
    entries.forEach((entry) => {
      entry.answer.ar = `إجابة ${entry.rank}`;
    });
    expect(validateRankedListEntries(entries)).toEqual([]);
  });

  it("rejects normalized duplicate answers across ranks", () => {
    const entries = createDefaultRankedListEntries();
    entries.forEach((entry) => {
      entry.answer.ar = `إجابة ${entry.rank}`;
    });
    entries[1].aliases = ["إِجَابَة 1!"];
    expect(validateRankedListEntries(entries).join(" ")).toContain("مكرر");
  });

  it("hides undiscovered answers and shows timer, active team, score, and strikes", () => {
    renderView();
    expect(screen.getByText("إجابة 1")).toBeInTheDocument();
    expect(screen.getAllByText("••••••••")).toHaveLength(9);
    expect(screen.getByTestId("ranked-list-countdown")).toHaveTextContent("9");
    expect(screen.getByText("دور الأول")).toBeInTheDocument();
    expect(screen.getByLabelText("1 أخطاء")).toBeInTheDocument();
  });

  it("reveals all answers and reports the winner when complete", () => {
    const onContinue = vi.fn();
    const state = createState("completed");
    render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={0}
        answer=""
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={onContinue}
      />,
    );
    expect(screen.queryByText("••••••••")).not.toBeInTheDocument();
    expect(screen.getByText("الفائز بالجولة: الأول")).toBeInTheDocument();
    fireEvent.click(screen.getByText("العودة إلى اللوحة"));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows claimed team and server-result feedback", () => {
    const state = createState();
    state.entries[0].claimedByTeamId = "team-a";
    render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={5}
        answer=""
        feedbackText="هذه الإجابة مكتشفة مسبقاً"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getAllByText("الأول").length).toBeGreaterThan(1);
    expect(screen.getByRole("status")).toHaveTextContent("مكتشفة مسبقاً");
  });

  it("renders incorrect and timeout feedback without changing scores locally", () => {
    const state = createState();
    const { rerender } = render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={4}
        answer=""
        feedbackText="إجابة غير صحيحة — احتُسب خطأ وانتقل الدور"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("غير صحيحة");
    rerender(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={0}
        answer=""
        feedbackText="انتهى الوقت — احتُسب خطأ وانتقل الدور"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("انتهى الوقت");
    expect(state.teams[0].temporaryScore).toBe(40);
  });

  it("disables submission for an eliminated active team", () => {
    const state = createState();
    state.teams[0].eliminated = true;
    render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={5}
        answer="إجابة"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("اكتب إجابة واحدة")).toBeDisabled();
    expect(screen.getByRole("button", { name: "إرسال" })).toBeDisabled();
  });

  it("shows a deterministic tie with zero awards", () => {
    const state = createState("completed");
    state.teams[0].temporaryScore = 100;
    state.teams[1].temporaryScore = 100;
    state.outcome = {
      type: "tie",
      awardedPointsByTeam: { "team-a": 0, "team-b": 0 },
    };
    renderView(state);
    expect(screen.getByText("تعادل — لا نقاط إضافية")).toBeInTheDocument();
    expect(screen.getAllByText(/\+0 إلى النتيجة/)).toHaveLength(2);
  });
});
