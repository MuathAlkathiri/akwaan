import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type {
  RankedListRoundActionEnvelopeDto,
  RankedListRoundStateResponseDto,
} from "@/api/generated/models";
import {
  getRankedListSecondsRemaining,
  RankedListRoundView,
} from "@/features/games/components/ranked-list-round";
import { mergeRankedListRoundActionIntoCache } from "@/features/games/hooks/use-games";
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
  turnDurationSeconds: 20,
  maxStrikesPerTeam: 3,
  collectedScore: status === "completed" ? 600 : 10,
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

const stabilityQueryKey = ["top10-stability"] as const;

function StableRoundHarness({ onMount }: { onMount: () => void }) {
  const client = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const round = useQuery({
    queryKey: stabilityQueryKey,
    queryFn: async () => ({ statusCode: 200, data: createState() }),
    select: (response) => response.data,
    staleTime: Infinity,
  });

  useEffect(onMount, [onMount]);

  if (!round.data)
    return <div data-testid="question-intro">Question intro</div>;

  const submit = () => {
    const current = round.data;
    const next = structuredClone(current);
    let outcome: RankedListRoundActionEnvelopeDto["data"]["outcome"];

    if (answer === "صحيح") {
      outcome = "correct";
      next.entries[1].revealed = true;
      next.entries[1].answer = "الإجابة الجديدة";
      next.collectedScore = 30;
    } else if (answer === "مكرر") {
      outcome = "already_discovered";
    } else {
      outcome = "incorrect";
      next.teams[0].strikes += 1;
    }

    client.setQueryData(
      stabilityQueryKey,
      (currentEnvelope:
        | { statusCode: number; data: RankedListRoundStateResponseDto }
        | undefined) =>
        mergeRankedListRoundActionIntoCache(currentEnvelope, {
          statusCode: 200,
          data: { outcome, state: next },
        }),
    );
    setFeedback(outcome);
    setAnswer("");
  };

  return (
    <RankedListRoundView
      question="اذكر أعلى عشرة"
      state={round.data}
      secondsRemaining={9}
      answer={answer}
      feedbackText={feedback}
      feedbackSequence={round.data.turnSequence}
      onAnswerChange={setAnswer}
      onSubmit={submit}
      onContinue={vi.fn()}
    />
  );
}

describe("Top 10 ranked-list mode", () => {
  it("preserves the ranked-list query envelope after an answer mutation", () => {
    const previousState = createState();
    const nextState = createState();
    nextState.turnSequence = 2;
    nextState.entries[1] = {
      ...nextState.entries[1],
      revealed: true,
      answer: "إجابة 2",
    };
    const response: RankedListRoundActionEnvelopeDto = {
      statusCode: 200,
      data: {
        outcome: "correct",
        matchedEntry: {
          id: nextState.entries[1].id,
          rank: nextState.entries[1].rank,
          points: nextState.entries[1].points,
          answer: "إجابة 2",
        },
        state: nextState,
      },
    };

    const cached = mergeRankedListRoundActionIntoCache(
      { statusCode: 200, data: previousState },
      response,
    );

    // This is the same selector used by the generated GET query. Writing the
    // inner state directly would make this expression undefined and unmount
    // the gameplay panel until polling repaired the cache.
    expect(cached.data).toBe(nextState);
    expect(cached.data.entries[1]).toMatchObject({
      revealed: true,
      answer: "إجابة 2",
    });
  });

  it("keeps the gameplay panel and input DOM mounted across correct, incorrect, and duplicate updates", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onMount = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <StableRoundHarness onMount={onMount} />
      </QueryClientProvider>,
    );

    const panel = await screen.findByTestId("ranked-list-round");
    const input = screen.getByPlaceholderText("اكتب إجابة واحدة");
    expect(screen.queryByTestId("question-intro")).not.toBeInTheDocument();
    expect(screen.getByText("إجابة 1")).toBeVisible();

    fireEvent.change(input, { target: { value: "صحيح" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("الإجابة الجديدة");
    expect(screen.getByText("30 / 600")).toBeVisible();
    expect(screen.getByTestId("ranked-list-round")).toBe(panel);
    expect(screen.getByPlaceholderText("اكتب إجابة واحدة")).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByText("إجابة 1")).toBeVisible();
    expect(screen.queryByTestId("question-intro")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "خطأ" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(screen.getByLabelText("2 أخطاء")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("ranked-list-round")).toBe(panel);
    expect(screen.getByPlaceholderText("اكتب إجابة واحدة")).toBe(input);
    expect(screen.queryByTestId("question-intro")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "مكرر" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "already_discovered",
      ),
    );
    expect(screen.getByTestId("ranked-list-round")).toBe(panel);
    expect(screen.getByPlaceholderText("اكتب إجابة واحدة")).toBe(input);
    expect(screen.queryByTestId("question-intro")).not.toBeInTheDocument();
    expect(onMount).toHaveBeenCalledOnce();
  });

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

  it("highlights only the newly revealed answer and keeps the input focused", () => {
    const state = createState();
    const { rerender } = render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={8}
        answer=""
        feedbackKind="correct"
        feedbackSequence={1}
        highlightedEntryId="entry-0"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText("إجابة 1").closest("li")).toHaveClass(
      "top10-answer-reveal",
    );
    expect(screen.getByPlaceholderText("اكتب إجابة واحدة")).toHaveFocus();

    rerender(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={state}
        secondsRemaining={8}
        answer=""
        feedbackKind="correct"
        feedbackSequence={2}
        highlightedEntryId="entry-0"
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText("إجابة 1").closest("li")).toHaveClass(
      "top10-answer-reveal",
    );
  });

  it("uses local incorrect feedback without replacing the answer board", () => {
    render(
      <RankedListRoundView
        question="اذكر أعلى عشرة"
        state={createState()}
        secondsRemaining={8}
        answer=""
        feedbackText="إجابة غير صحيحة"
        feedbackKind="incorrect"
        feedbackSequence={1}
        onAnswerChange={vi.fn()}
        onSubmit={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getAllByText("••••••••")).toHaveLength(9);
    expect(
      screen.getByPlaceholderText("اكتب إجابة واحدة").closest("form"),
    ).toHaveClass("top10-answer-shake");
    expect(screen.getByRole("status")).toHaveTextContent("غير صحيحة");
  });
});
