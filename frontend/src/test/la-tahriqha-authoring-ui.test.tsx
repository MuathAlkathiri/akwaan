import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LaTahriqhaFields } from "@/features/world-management/components/content-items/la-tahriqha-fields";
import {
  emptyContentItemForm,
  type LaTahriqhaFormState,
} from "@/features/world-management/services/content-item-form.service";

/**
 * The dish editor as an author actually uses it.
 *
 * The one thing this screen exists to make hard to get wrong is the split — five
 * that belong in the dish, three that plausibly could — so the running count is
 * checked here rather than left to the save button to discover.
 */

function Harness() {
  const [value, setValue] = useState<LaTahriqhaFormState>({
    ...emptyContentItemForm("scope-food").laTahriqha,
    enabled: true,
  });
  return <LaTahriqhaFields value={value} onChange={setValue} />;
}

describe("the لا تحرقها dish editor", () => {
  it("offers eight cards with the split already satisfied", () => {
    render(<Harness />);
    for (let index = 0; index < 8; index += 1) {
      expect(
        screen.getByTestId(`la-tahriqha-ingredient-${index}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId("la-tahriqha-balance")).toHaveTextContent(
      "5 صحيحة · 3 محتملة",
    );
  });

  it("keeps the running split honest as the author changes a card", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("la-tahriqha-correct-0"));
    expect(screen.getByTestId("la-tahriqha-balance")).toHaveTextContent(
      "4 صحيحة · 4 محتملة",
    );
    fireEvent.click(screen.getByTestId("la-tahriqha-correct-0"));
    expect(screen.getByTestId("la-tahriqha-balance")).toHaveTextContent(
      "5 صحيحة · 3 محتملة",
    );
  });

  it("records what the author types for a card and for the dish", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("la-tahriqha-dish-name"), {
      target: { value: "كبسة دجاج" },
    });
    fireEvent.change(screen.getByTestId("la-tahriqha-ingredient-0"), {
      target: { value: "أرز" },
    });
    expect(screen.getByTestId("la-tahriqha-dish-name")).toHaveValue(
      "كبسة دجاج",
    );
    expect(screen.getByTestId("la-tahriqha-ingredient-0")).toHaveValue("أرز");
  });

  it("leaves the dish window empty so an untouched field means the baseline", () => {
    render(<Harness />);
    expect(screen.getByTestId("la-tahriqha-timer")).toHaveValue("");
  });
});
