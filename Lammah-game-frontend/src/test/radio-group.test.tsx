import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

describe("radio group", () => {
  it("centers the selected indicator without direction-sensitive transforms", () => {
    render(
      <RadioGroup dir="rtl" value="green">
        <RadioGroupItem value="green" aria-label="الأخضر" />
      </RadioGroup>,
    );

    const indicator = screen
      .getByRole("radio", { name: "الأخضر" })
      .querySelector('[data-slot="radio-group-indicator"]');
    expect(indicator).toHaveClass("absolute", "inset-0", "place-items-center");
    expect(indicator?.firstElementChild).not.toHaveClass(
      "rtl:translate-x-1/2",
    );
  });
});
