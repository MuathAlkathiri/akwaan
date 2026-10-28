import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  BombExplainer,
  SAMPLE_BOMB_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

describe("BombExplainer", () => {
  const reduceMotion = () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  };

  it("counts down the active clock continuously while freezing the inactive clock", async () => {
    vi.useRealTimers();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:30");
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:30");
    await waitFor(
      () => expect(screen.getByTestId("bomb-team-a-clock")).not.toHaveTextContent("0:30"),
      { timeout: 3_500 },
    );
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:30");
  });

  it("teaches the continuous clock and challenge result", async () => {
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    expect(
      screen.getByText(SAMPLE_BOMB_TUTORIAL_SCENARIO.prompt),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByText("الفريق الثاني يفوز بالتحدي")).toBeInTheDocument();
    expect(
      screen.getByText(/نقطة المباراة تُمنح بعد حسم التحدي/),
    ).toBeInTheDocument();
  });

  it("shows that incorrect answers and skip retain the active team", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByTestId("bomb-phone-answer")).toHaveValue("المريخ");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText(/خاطئة، الدور مستمر/)).toBeInTheDocument();
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByText(/صحيحة، يعود الضغط للفريق الأول/)).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText("كم ضلعًا للمثلث؟")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-skip-penalty")).toHaveTextContent("−5 ثوانٍ");
  });

  it("renders the text-only question and lets the active phone type and submit", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    expect(screen.getByText("ما هو أكبر كوكب في المجموعة الشمسية؟")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const input = screen.getByTestId("bomb-phone-answer");
    await user.clear(input);
    await user.type(input, "المشتري");
    await user.click(screen.getByTestId("bomb-phone-submit"));
    expect(screen.getByTestId("bomb-phone-submit")).toHaveTextContent("تم الإرسال");
  });

  it("advances to the next illustrated question only after a correct handoff", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByText("وش اسم هذا الكوكب؟")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /كوكب ذي حلقات/ })).toBeInTheDocument();
    expect(screen.getByTestId("bomb-phone-answer")).toHaveValue("");
    expect(screen.queryByTestId("bomb-option-saturn")).not.toBeInTheDocument();
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:18");
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:30");
  });

  it("shows the opposing team answering and hands pressure back without resetting clocks", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    for (let index = 0; index < 7; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("bomb-phone-b")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-phone-answer")).toHaveValue("زحل");
    expect(screen.getByText(/زحل — صحيحة/)).toBeInTheDocument();
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:27");
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText("كم ضلعًا للمثلث؟")).toBeInTheDocument();
    expect(screen.getByText(/عاد الضغط للفريق الأول/)).toBeInTheDocument();
    expect(screen.getByTestId("bomb-phone-a")).toBeInTheDocument();
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:18");
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:24");
  });

  it("falls back safely when the illustrated question media fails", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer
        scenario={{
          ...SAMPLE_BOMB_TUTORIAL_SCENARIO,
          nextQuestion: {
            ...SAMPLE_BOMB_TUTORIAL_SCENARIO.nextQuestion!,
            media: {
              type: "image",
              url: "/missing-bomb-v4-image.webp",
              altText: "صورة السؤال",
            },
          },
        }}
        mode="preview"
      />,
    );
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    fireEvent.error(screen.getByRole("img", { name: "صورة السؤال" }));
    const fallback = await waitFor(() => screen.getByTestId("bomb-media-fallback"));
    expect(fallback).toHaveTextContent("تعذّر تحميل الصورة");
    expect(fallback).not.toHaveTextContent("المشتري");
  });

  it("keeps the first clock balance through handoff and applies the exact skip penalty", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    for (let index = 0; index < 9; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:13");
    expect(screen.getByTestId("bomb-team-b-clock")).toHaveTextContent("0:24");
    expect(screen.getByText(/−5 ثوانٍ عقوبة التخطّي/)).toBeInTheDocument();
    for (let index = 0; index < 2; index += 1) {
      await user.click(screen.getByTestId("explainer-next"));
    }
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:00");
    expect(screen.getByText("الفريق الثاني يفوز بالتحدي")).toBeInTheDocument();
  });

  it("keeps an incorrect answer on the same team without advancing the question", async () => {
    reduceMotion();
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    await user.click(screen.getByTestId("explainer-next"));
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText(SAMPLE_BOMB_TUTORIAL_SCENARIO.prompt)).toBeInTheDocument();
    expect(screen.getByText(/القنبلة مع الفريق الأول/)).toBeInTheDocument();
    expect(screen.getByTestId("bomb-team-a-clock")).toHaveTextContent("0:25");
  });

  it("supports replay after the final state", async () => {
    const user = userEvent.setup();
    render(
      <BombExplainer scenario={SAMPLE_BOMB_TUTORIAL_SCENARIO} mode="preview" />,
    );
    await user.click(screen.getByTestId("explainer-skip"));
    await user.click(screen.getByTestId("explainer-replay"));
    expect(
      screen.getByText(SAMPLE_BOMB_TUTORIAL_SCENARIO.prompt),
    ).toBeInTheDocument();
  });
});
