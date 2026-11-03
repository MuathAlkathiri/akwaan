import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LaTahriqhaExplainer,
  SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
} from "@/features/challenge-explainer";

function reducedMotion(matches = true) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
}

describe("لا تحرقها mechanic tutorial", () => {
  it("shows the eight-card captain selection without leaking truth before reveal", async () => {
    reducedMotion();
    render(
      <LaTahriqhaExplainer
        scenario={SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    expect(screen.getByTestId("la-tahriqha-ingredients")).toBeInTheDocument();
    expect(screen.getAllByTestId(/la-tahriqha-ingredient-/)).toHaveLength(8);
    expect(screen.getByText("نورة")).toBeInTheDocument();
    expect(screen.queryByText("احترق الطبق")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText("3 / 5 بطاقات مختارة")).toBeInTheDocument();
    expect(screen.queryByText("الدخيل")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getAllByTestId("la-tahriqha-risk-decision")).toHaveLength(2);
    expect(
      screen.getAllByTestId("la-tahriqha-risk-decision")[0],
    ).toHaveTextContent("نكتفي بـ3؟");
  });

  it("demonstrates burn, perfect dish, captain rotation and the derived match point", async () => {
    reducedMotion();
    render(
      <LaTahriqhaExplainer
        scenario={SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO}
        mode="preview"
      />,
    );
    const user = userEvent.setup();
    for (let index = 0; index < 9; index += 1)
      await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText("احترق الطبق!")).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getAllByText("طبق مثالي!").length).toBeGreaterThan(0);
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText(/الطبق الثاني يبدأ بقادة جدد/)).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-next"));
    expect(screen.getByText(/نكمل بسرعة إلى الطبق الثالث/)).toBeInTheDocument();
    await user.click(screen.getByTestId("explainer-skip"));
    expect(screen.getByTestId("la-tahriqha-final-score")).toHaveTextContent(
      "14",
    );
    expect(screen.getByTestId("la-tahriqha-final-score")).toHaveTextContent(
      "+1 Match point",
    );
    await user.click(screen.getByTestId("explainer-replay"));
    expect(
      screen.queryByTestId("la-tahriqha-final-score"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("نورة")).toBeInTheDocument();
  });
});
