import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerPayloadFields } from "@/features/world-management/components/content-items/answer-payload-fields";
import {
  emptyAnswerState,
  type AnswerFormState,
} from "@/features/world-management/services/content-item-form.service";

/**
 * The Closest interaction control as an author meets it.
 *
 * The rule this screen carries is that new content chooses its own continuum.
 * An unselected mode therefore has to read as a question rather than as a
 * default, and the legacy number input must not be on the menu at all — it is
 * what the runtime falls back to when nothing is authored, so offering it is how
 * a catalog quietly re-fills with content the slider can never reach.
 */

function Harness({
  isNewItem,
  initial,
}: {
  isNewItem: boolean;
  initial?: Partial<AnswerFormState>;
}) {
  const [value, setValue] = useState<AnswerFormState>({
    ...emptyAnswerState("closest"),
    ...initial,
  });
  return (
    <AnswerPayloadFields
      value={value}
      onChange={setValue}
      availableModes={["closest"]}
      isNewItem={isNewItem}
    />
  );
}

describe("the مين أقرب interaction control", () => {
  it("starts a new item unselected and says the range is the author's call", () => {
    render(<Harness isNewItem />);
    expect(screen.getByLabelText("طريقة تفاعل مين أقرب")).toHaveTextContent(
      "اختر طريقة التفاعل",
    );
    expect(
      screen.getByTestId("closest-mode-required-hint"),
    ).toHaveTextContent("لا يوجد نطاق افتراضي");
    // Nothing to fill in until a continuum is chosen — the form does not ask
    // for bounds it has no mode for.
    expect(screen.queryByLabelText("الحد الأدنى")).toBeNull();
  });

  it("marks an existing legacy item as legacy without blocking it", () => {
    render(<Harness isNewItem={false} initial={{ closestInteraction: "legacy" }} />);
    expect(screen.getByTestId("closest-legacy-badge")).toHaveTextContent(
      "محتوى قديم",
    );
    expect(screen.queryByTestId("closest-mode-required-hint")).toBeNull();
    // Legacy carries no continuum, so no bounds are demanded of it.
    expect(screen.queryByLabelText("الحد الأدنى")).toBeNull();
  });

  it("reveals the numeric-range fields only once that mode is chosen", () => {
    render(
      <Harness isNewItem initial={{ closestInteraction: "numeric-range" }} />,
    );
    expect(screen.getByLabelText("الحد الأدنى")).toBeInTheDocument();
    expect(screen.getByLabelText("الحد الأعلى")).toBeInTheDocument();
    expect(screen.getByLabelText("الوحدة")).toBeInTheDocument();
    expect(screen.queryByLabelText("نقطة الارتكاز اليسرى")).toBeNull();
    expect(screen.queryByTestId("closest-mode-required-hint")).toBeNull();
  });

  it("reveals the anchor fields only once that mode is chosen", () => {
    render(
      <Harness isNewItem initial={{ closestInteraction: "between-anchors" }} />,
    );
    expect(screen.getByLabelText("نقطة الارتكاز اليسرى")).toBeInTheDocument();
    expect(screen.getByLabelText("نقطة الارتكاز اليمنى")).toBeInTheDocument();
    expect(screen.queryByLabelText("الوحدة")).toBeNull();
  });
});
