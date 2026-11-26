import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MechanicTutorialRenderer,
  SAMPLE_COMBO_TUTORIAL_SCENARIO,
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
  type ClosestTutorialScenario,
  type FirstNoteTutorialScenario,
  type RyoTutorialScenario,
} from "@/features/challenge-explainer";
import {
  PHONE_FRAME,
  SCENE_SCALE,
  SHARED_SCREEN_FRAME,
} from "@/features/challenge-explainer/scene-template";

const FIRST_NOTE_FIXTURE: FirstNoteTutorialScenario = {
  kind: "first-note",
  version: 1,
  prompt: "تعرّفوا على الأغنية من مزاد ثوانٍ قصير.",
  title: "على بالي",
  clueLabel: "السياق",
  contextualClue: "أغنية عربية معاصرة بصوت نسائي.",
  bids: [
    { team: "team-a", seconds: 8 },
    { team: "team-b", seconds: 5 },
    { team: "team-a", seconds: 3 },
  ],
  acceptedAnswers: ["على بالي"],
  firstSubmittedAnswer: "ليلة صيف",
  stealSubmittedAnswer: "على بالي",
  outcome: {
    songCount: 3,
    bids: [
      { team: "team-a", seconds: 8 },
      { team: "team-b", seconds: 5 },
      { team: "team-a", seconds: 3 },
    ],
    finalBidSeconds: 3,
    auctionWinner: "team-a",
    firstAnswerTeam: "team-a",
    firstAnswerFailed: true,
    stealTeam: "team-b",
    stolen: true,
    firstCorrectReward: 13,
    stealReward: 11,
    points: { "team-a": 0, "team-b": 11 },
    reason: "first-note.auction-steal",
  },
};

const CLOSEST_FIXTURE: ClosestTutorialScenario = {
  kind: "closest",
  version: 1,
  prompt: "في أي سنة تأسست المملكة العربية السعودية؟",
  teamAEstimate: 1930,
  teamBEstimate: 1935,
  correctValue: 1932,
  outcome: {
    teamADistance: 2,
    teamBDistance: 3,
    winnerTeam: "team-a",
    tie: false,
    mechanicTallyDelta: 1,
    matchPointDelta: 0,
    reason: "closest.absolute-distance",
  },
};

const RYO_FIXTURE: RyoTutorialScenario = {
  kind: "ryo",
  version: 1,
  prompt: "أي دولة عربية تضم مدينة البتراء الأثرية؟",
  options: [
    { id: "opt-1", label: "الأردن" },
    { id: "opt-2", label: "لبنان" },
    { id: "opt-3", label: "عُمان" },
    { id: "opt-4", label: "تونس" },
  ],
  correctOptionId: "opt-1",
  answeringSelectionOptionId: "opt-1",
  opposingDecision: "STEAL",
  outcome: {
    teamRole: "opposing",
    delta: 1,
    reason: "ryo.correct-steal",
    correct: true,
  },
};

describe("GameScene unified explainers", () => {
  it("renders scene chrome, device label pills, step counter, and fixed dimensions", () => {
    render(
      <MechanicTutorialRenderer scenario={SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO} />,
    );

    expect(screen.getByTestId("scene-demo-badge")).toHaveTextContent(
      "شرح توضيحي · مو السؤال الحقيقي",
    );
    expect(screen.getByTestId("scene-step-counter")).toHaveTextContent("1 / 3");
    expect(screen.getByTestId("scene-label-team-a")).toHaveTextContent(
      "جوال الفريق الأول",
    );
    expect(screen.getByTestId("scene-label-shared")).toHaveTextContent(
      "الشاشة الرئيسية",
    );
    expect(screen.getByTestId("scene-label-team-b")).toHaveTextContent(
      "جوال الفريق الثاني",
    );

    const screenFrame = screen.getByTestId("scene-screen-frame");
    expect(screenFrame).toHaveStyle({
      width: `${SHARED_SCREEN_FRAME.width}px`,
      height: `${SHARED_SCREEN_FRAME.height}px`,
    });
    expect(screenFrame.firstElementChild).toHaveStyle({
      transform: `scale(${SCENE_SCALE})`,
    });

    const phoneFrames = screen.getAllByTestId("scene-phone-frame");
    expect(phoneFrames).toHaveLength(2);
    for (const phoneFrame of phoneFrames) {
      expect(phoneFrame).toHaveStyle({
        width: `${PHONE_FRAME.width}px`,
        height: `${PHONE_FRAME.height}px`,
      });
      expect(phoneFrame.firstElementChild).toHaveStyle({
        transform: `scale(${SCENE_SCALE})`,
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByTestId("scene-step-counter")).toHaveTextContent("2 / 3");
    const timeline = screen.getByTestId("scene-timeline");
    expect(timeline.querySelectorAll('[data-state="passed"]')).toHaveLength(1);
    expect(timeline.querySelectorAll('[data-state="current"]')).toHaveLength(1);
    expect(timeline.querySelectorAll('[data-state="upcoming"]')).toHaveLength(
      1,
    );
  });

  it("renders ekshifni through GameScene across all 3 steps with challenge recap on phones", () => {
    render(
      <MechanicTutorialRenderer scenario={SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO} />,
    );

    expect(screen.getByTestId("ekshifni-board")).toHaveAttribute(
      "data-obscured",
      "true",
    );
    expect(screen.getByTestId("ekshifni-pick-2")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("ekshifni-answer-input").length,
    ).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByTestId("ekshifni-board")).toHaveAttribute(
      "data-unmasked",
      "true",
    );
    expect(screen.getAllByTestId("ekshifni-reveal").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getAllByTestId("ekshifni-recap")).toHaveLength(3);
    expect(screen.queryByText(/فزتم بالمباراة/)).toBeNull();
  });

  it("renders la-tahriqha through GameScene across all 3 steps with challenge recap on phones", () => {
    render(
      <MechanicTutorialRenderer
        scenario={SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO}
      />,
    );

    expect(
      screen.getAllByTestId("la-tahriqha-dish-name").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId("la-tahriqha-commit").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(
      screen.getAllByTestId("la-tahriqha-reveal").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getAllByTestId("la-tahriqha-recap")).toHaveLength(3);
    expect(screen.queryByText(/فزتم بالمباراة/)).toBeNull();
  });

  it("renders first-note through GameScene with a bid slider and challenge recap on phones", () => {
    render(<MechanicTutorialRenderer scenario={FIRST_NOTE_FIXTURE} />);

    expect(screen.getByTestId("first-note-bid-slider")).toBeInTheDocument();
    expect(screen.getByTestId("first-note-submit-bid")).toBeInTheDocument();
    expect(
      screen.getByTestId("first-note-auction-waiting"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(
      screen.getAllByTestId("first-note-reveal").length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getAllByTestId("first-note-recap")).toHaveLength(3);
    expect(screen.queryByText(/فزتم بالمباراة/)).toBeNull();
  });

  it("derives slider bounds for closest and uses المؤشر wording", () => {
    render(<MechanicTutorialRenderer scenario={CLOSEST_FIXTURE} />);

    expect(
      screen.getByText("الفريقين يقدّرون الرقم بالمؤشر في نفس الوقت."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/سلايدر/)).toBeNull();
    expect(screen.getAllByRole("slider")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const waitingPhones = screen.getAllByTestId("participant-waiting");
    expect(waitingPhones).toHaveLength(2);
    for (const phone of waitingPhones) {
      expect(phone).toHaveAttribute("data-match-complete", "false");
    }
  });

  it("locks both ryo teams in step 2 and shows the dynamic explanation line", () => {
    render(<MechanicTutorialRenderer scenario={RYO_FIXTURE} />);

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.getByTestId("ryo-explain-line")).toHaveTextContent(
      "الفريق الأول جاوب صح، والفريق الثاني قرأهم صح وسرق النقطة.",
    );
    expect(screen.getByTestId("ryo-lock-answering")).not.toHaveTextContent(
      "يختارون",
    );
    expect(screen.getByTestId("ryo-lock-opposing")).not.toHaveTextContent(
      "يختارون",
    );
  });

  it("shows reveal-only phone, spent charge, and 0 balance for combo step 2", () => {
    render(
      <MechanicTutorialRenderer scenario={SAMPLE_COMBO_TUTORIAL_SCENARIO} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(screen.queryByTestId("combo-answer-input")).toBeNull();
    expect(screen.getByTestId("combo-charge-team-b")).toHaveTextContent(
      "انصرف",
    );
    expect(screen.getByTestId("combo-streak-points")).toHaveTextContent("0");
  });
});
