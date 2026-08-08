import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "@/legacy/classic-game/components/game-board";
import { QuestionPlayer } from "@/legacy/classic-game/components/question-player/question-player";
import { AnswerPlayer } from "@/legacy/classic-game/components/answer-player/answer-player";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  useGame: vi.fn(),
  useGameQuestion: vi.fn(),
  useGameQuestionAnswer: vi.fn(),
  reveal: vi.fn(),
  submit: vi.fn(),
  adjustScore: vi.fn(),
  changeTurn: vi.fn(),
  revealState: { isPending: false, isError: false },
  submitState: { isPending: false, isError: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/legacy/classic-game/hooks/use-games", () => ({
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
  useAdjustGameScore: () => ({
    isPending: false,
    mutate: mocks.adjustScore,
  }),
  useChangeGameTurn: () => ({
    isPending: false,
    mutate: mocks.changeTurn,
  }),
}));

vi.mock("@/legacy/classic-game/components/ranked-list-round", () => ({
  RankedListRound: ({ question }: { question: string }) => (
    <div data-testid="ranked-list-round">{question}</div>
  ),
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
    { id: "team-1", name: "الصقور", members: [], score: 0, color: "yellow" },
    { id: "team-2", name: "النجوم", members: [], score: 0, color: "pink" },
  ],
  teamA: {
    id: "team-1",
    name: "الصقور",
    members: [],
    score: 0,
    color: "yellow",
  },
  teamB: {
    id: "team-2",
    name: "النجوم",
    members: [],
    score: 0,
    color: "pink",
  },
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
  it("renders the board header RTL with the logo before the home action", () => {
    render(<GameBoard gameId="game-1" />);
    const header = screen.getByTestId("game-board-header");
    const logo = screen.getByRole("link", { name: "لمة" });
    const home = screen.getByRole("link", { name: "الرئيسية" });

    expect(header).toHaveAttribute("dir", "rtl");
    expect(
      logo.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("matches the current-turn badge to the active team's exact color", () => {
    const { rerender } = render(<GameBoard gameId="game-1" />);
    expect(screen.getByTestId("current-turn")).toHaveClass(
      "bg-amber-400",
      "text-amber-950",
      "border-amber-200/80",
    );

    mocks.useGame.mockReturnValue({
      data: {
        ...boardGame,
        currentTeamTurn: "B",
        currentTeamIndex: 1,
      },
      isLoading: false,
      error: null,
    });
    rerender(<GameBoard gameId="game-1" />);
    expect(screen.getByTestId("current-turn")).toHaveClass(
      "bg-pink-600",
      "text-pink-50",
      "border-pink-300/70",
    );
  });

  it("offers optional score correction and manual turn controls", () => {
    mocks.useGame.mockReturnValue({
      data: {
        ...boardGame,
        teams: [
          { ...boardGame.teams[0], score: 200 },
          boardGame.teams[1],
        ],
        teamA: { ...boardGame.teamA, score: 200 },
      },
      isLoading: false,
      error: null,
    });
    render(<GameBoard gameId="game-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "إضافة 50 نقطة إلى الصقور" }),
    );
    expect(mocks.adjustScore).toHaveBeenCalledWith({
      teamIndex: 0,
      delta: 50,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "خصم 50 نقطة من الصقور" }),
    );
    expect(mocks.adjustScore).toHaveBeenCalledWith({
      teamIndex: 0,
      delta: -50,
    });

    fireEvent.click(screen.getByTestId("change-turn"));
    expect(mocks.changeTurn).toHaveBeenCalledOnce();
  });

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

  it("renders six independent 600-point Top 10 board entries", () => {
    const top10Questions = Array.from({ length: 6 }, (_, index) => ({
      id: `top10-${index + 1}`,
      categoryId: "category-top10",
      points: 600,
      answered: index === 0,
      question: { questionType: "ranked_list" as const },
    }));
    mocks.useGame.mockReturnValue({
      data: {
        ...boardGame,
        categories: [{ id: "category-top10", name: "Top 10" }],
        board: [top10Questions],
      },
      isLoading: false,
      error: null,
    });
    render(<GameBoard gameId="game-1" />);
    expect(screen.getAllByRole("button", { name: /Top 10 600/ })).toHaveLength(
      6,
    );
    expect(screen.getAllByText("600")).toHaveLength(6);
    expect(screen.getByTestId("board-question-top10-1")).toBeDisabled();
    expect(screen.getByTestId("board-question-top10-2")).toBeEnabled();
    fireEvent.click(screen.getByTestId("board-question-top10-2"));
    expect(mocks.push).toHaveBeenCalledWith(
      "/games/game-1/questions/top10-2",
    );
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
    expect(screen.getByTestId("question-current-turn")).toHaveTextContent(
      /الصقور.*الدور الآن/,
    );
    expect(
      screen.getByTestId("question-current-turn").querySelector("span"),
    ).toHaveClass("bg-amber-400", "text-amber-950");
  });

  it("updates the question turn indicator to the other team's saved color", () => {
    mocks.useGame.mockReturnValue({
      data: { ...boardGame, currentTeamTurn: "B", currentTeamIndex: 1 },
      isLoading: false,
      error: null,
    });

    render(<QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />);

    expect(screen.getByTestId("question-current-turn")).toHaveTextContent(
      /النجوم.*الدور الآن/,
    );
    expect(
      screen.getByTestId("question-current-turn").querySelector("span"),
    ).toHaveClass("bg-pink-600", "text-pink-50");
  });

  it("keeps an answered Top 10 question on its completed round screen", () => {
    mocks.useGameQuestion.mockReturnValue({
      data: {
        ...questionView,
        questionType: "ranked_list",
        isAnswered: true,
      },
      isLoading: false,
      isError: false,
    });

    render(<QuestionPlayer gameId="game-1" gameQuestionId="game-question-1" />);

    expect(screen.getByTestId("ranked-list-round")).toHaveTextContent(
      questionView.question,
    );
    expect(
      screen.queryByText("تم احتساب هذا السؤال مسبقًا."),
    ).not.toBeInTheDocument();
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
      expect(
        screen.getByRole("button", { name: new RegExp(team.name) }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("لا أحد")).toBeInTheDocument();
    expect(screen.getByTestId("question-current-turn")).toHaveTextContent(
      /الصقور.*الدور الآن/,
    );
  });

  it("submits one selected team and returns to the board", async () => {
    render(<AnswerPlayer gameId="game-1" gameQuestionId="game-question-1" />);
    fireEvent.click(screen.getByRole("button", { name: /النجوم/ }));
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
    const team = screen.getByRole("button", { name: /الصقور/ });
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
      expect(
        screen.getByRole("button", { name: new RegExp(team.name) }),
      ).toBeDisabled(),
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
