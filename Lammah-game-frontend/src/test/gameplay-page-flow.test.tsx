import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "@/features/games/components/game-board";
import { QuestionPlayer } from "@/features/games/components/question-player/question-player";
import { AnswerPlayer } from "@/features/games/components/answer-player/answer-player";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  useGame: vi.fn(),
  useGameQuestion: vi.fn(),
  useGameQuestionAnswer: vi.fn(),
  reveal: vi.fn(),
  submit: vi.fn(),
  revealState: { isPending: false, isError: false },
  submitState: { isPending: false, isError: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/features/games/hooks/use-games", () => ({
  useGame: (...args: unknown[]) => mocks.useGame(...args),
  useGameQuestion: (...args: unknown[]) => mocks.useGameQuestion(...args),
  useGameQuestionAnswer: (...args: unknown[]) =>
    mocks.useGameQuestionAnswer(...args),
  useRevealGameQuestion: () => ({
    ...mocks.revealState,
    mutateAsync: mocks.reveal,
  }),
  useSubmitGameQuestionResult: () => ({
    ...mocks.submitState,
    mutateAsync: mocks.submit,
  }),
}));

const questionView = {
  gameId: "game-1",
  gameQuestionId: "game-question-1",
  sourceQuestionId: "source-question-1",
  category: { id: "category-1", name: "كرة القدم" },
  points: 400 as const,
  question: "من فاز بالبطولة؟",
  questionType: "standard" as const,
  isAnswered: false,
  isAnswerRevealed: false,
};

const answerView = {
  ...questionView,
  isAnswerRevealed: true,
  answer: "السعودية",
  acceptedAnswers: ["المنتخب السعودي"],
  teams: [
    { _id: "team-1", name: "الصقور", members: [], score: 400 },
    { _id: "team-2", name: "النجوم", members: [], score: 200 },
    { _id: "team-3", name: "الأبطال", members: [], score: 0 },
  ],
};

const boardGame = {
  id: "game-1",
  name: "Game",
  teams: [
    { id: "team-1", name: "الصقور", members: [], score: 0 },
    { id: "team-2", name: "النجوم", members: [], score: 0 },
  ],
  teamA: { id: "team-1", name: "الصقور", members: [], score: 0 },
  teamB: { id: "team-2", name: "النجوم", members: [], score: 0 },
  categories: [{ id: "category-1", name: "كرة القدم" }],
  board: [
    [
      {
        id: "game-question-1",
        categoryId: "category-1",
        points: 400,
        answered: false,
        question: { questionType: "standard" },
      },
    ],
  ],
  currentTeamTurn: "A",
  currentTeamIndex: 0,
  status: "in_progress",
  createdAt: "",
  updatedAt: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.revealState, { isPending: false, isError: false });
  Object.assign(mocks.submitState, { isPending: false, isError: false });
  mocks.reveal.mockResolvedValue(answerView);
  mocks.submit.mockResolvedValue(boardGame);
  mocks.useGame.mockReturnValue({
    data: boardGame,
    isLoading: false,
    error: null,
  });
  mocks.useGameQuestion.mockReturnValue({
    data: questionView,
    isLoading: false,
    isError: false,
  });
  mocks.useGameQuestionAnswer.mockReturnValue({
    data: answerView,
    isLoading: false,
    isError: false,
  });
});

describe("dedicated gameplay question routes", () => {
  it("navigates from a board card without opening the old modal", () => {
    render(<GameBoard gameId="game-1" />);
    fireEvent.click(screen.getByTestId("board-question-game-question-1"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/games/game-1/questions/game-question-1",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps answered board questions visibly disabled", () => {
    mocks.useGame.mockReturnValue({
      data: {
        ...boardGame,
        board: [[{ ...boardGame.board[0][0], answered: true }]],
      },
      isLoading: false,
      error: null,
    });
    render(<GameBoard gameId="game-1" />);
    expect(screen.getByTestId("board-question-game-question-1")).toBeDisabled();
  });

  it("renders snapshot text without exposing the answer", () => {
    render(<QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(screen.getByTestId("game-question-text")).toHaveTextContent(
      questionView.question,
    );
    expect(screen.queryByText(answerView.answer)).not.toBeInTheDocument();
    expect(screen.getByText("العودة للوحة").closest("a")).toHaveAttribute(
      "href",
      "/games/game-1",
    );
  });

  it.each([
    ["image", "/ready.jpg", "img"],
    ["video", "/ready.mp4", "video"],
    ["audio", "/ready.m4a", "audio"],
  ] as const)(
    "renders safe ready %s media below the text",
    (type, url, tag) => {
      mocks.useGameQuestion.mockReturnValue({
        data: {
          ...questionView,
          presentation: {
            preferredType: type,
            type,
            mediaAvailable: true,
            mediaUrl: url,
          },
        },
        isLoading: false,
        isError: false,
      });
      const { container } = render(
        <QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />,
      );
      expect(screen.getByTestId("game-question-text")).toBeInTheDocument();
      expect(container.querySelector(tag)).toBeInTheDocument();
    },
  );

  it("renders a fully playable text-only question when media is unavailable", () => {
    mocks.useGameQuestion.mockReturnValue({
      data: {
        ...questionView,
        presentation: {
          preferredType: "video",
          type: "text",
          mediaAvailable: false,
          fallbackReason: "FAILED",
        },
      },
      isLoading: false,
      isError: false,
    });
    const { container } = render(
      <QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />,
    );
    expect(screen.getByTestId("game-question-text")).toBeInTheDocument();
    expect(container.querySelector("video,audio,img")).toBeNull();
  });

  it("reveals once and navigates to the dedicated answer route", async () => {
    render(<QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    fireEvent.click(screen.getByText("إظهار الإجابة"));
    await waitFor(() => expect(mocks.reveal).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith(
      "/games/game-1/questions/game-question-1/answer",
    );
  });

  it("restores the same snapshot when the question component remounts", () => {
    const first = render(
      <QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />,
    );
    first.unmount();
    render(<QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(mocks.useGameQuestion).toHaveBeenLastCalledWith(
      "game-1",
      "game-question-1",
    );
    expect(screen.getByText(questionView.question)).toBeInTheDocument();
  });
});

describe("dedicated answer and scoring route", () => {
  it("shows the answer and every game team dynamically", () => {
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(screen.getByTestId("game-question-answer")).toHaveTextContent(
      answerView.answer,
    );
    answerView.teams.forEach((team) =>
      expect(screen.getByText(team.name)).toBeInTheDocument(),
    );
    expect(screen.getByText("لا أحد")).toBeInTheDocument();
  });

  it("submits one selected team and returns to the board", async () => {
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    fireEvent.click(screen.getByText("النجوم"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    expect(mocks.submit).toHaveBeenCalledWith("team-2");
    expect(mocks.replace).toHaveBeenCalledWith("/games/game-1");
  });

  it("guards against rapid double submission before mutation state updates", async () => {
    let resolve!: (value: unknown) => void;
    mocks.submit.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    const team = screen.getByText("الصقور");
    fireEvent.click(team);
    fireEvent.click(team);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    resolve(boardGame);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
  });

  it("sends null for no one", async () => {
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    fireEvent.click(screen.getByText("لا أحد"));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(null));
  });

  it("disables every selection while submitting", () => {
    mocks.submitState.isPending = true;
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(screen.getByText("لا أحد").closest("button")).toBeDisabled();
    answerView.teams.forEach((team) =>
      expect(screen.getByText(team.name).closest("button")).toBeDisabled(),
    );
  });

  it("keeps the page open and displays a safe submission error", () => {
    mocks.submitState.isError = true;
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "تعذر تحديث النتيجة، حاول مرة أخرى.",
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not render scoring controls for an already answered question", () => {
    mocks.useGameQuestionAnswer.mockReturnValue({
      data: { ...answerView, isAnswered: true },
      isLoading: false,
      isError: false,
    });
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    expect(
      screen.getByText("تم احتساب هذا السؤال مسبقًا."),
    ).toBeInTheDocument();
    expect(screen.queryByText("لا أحد")).not.toBeInTheDocument();
  });

  it("uses an RTL responsive full-page layout", () => {
    const { container } = render(
      <AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />,
    );
    expect(container.querySelector("main")).toHaveAttribute("dir", "rtl");
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeInTheDocument();
  });
});
