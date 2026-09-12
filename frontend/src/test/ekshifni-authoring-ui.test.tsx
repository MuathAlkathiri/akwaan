import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EkshifniFields } from "@/features/world-management/components/content-items/ekshifni-fields";
import {
  emptyContentItemForm,
  EKSHIFNI_ROLE_LABEL,
} from "@/features/world-management/services/content-item-form.service";

/**
 * Authoring six masks is a visual job.
 *
 * Twenty-four decimals are checkable but not authorable: a producer needs to see
 * that box 1 landed on the eyes before publishing, because nobody finds out
 * otherwise until a room is looking at it.
 */

const authored = () => {
  const base = emptyContentItemForm("scope-1").ekshifni;
  return { ...base, enabled: true, targetAnswer: "فيروز" };
};

const renderFields = (imageUrl?: string) => {
  const onChange = vi.fn();
  render(
    <EkshifniFields
      value={authored()}
      acceptedAnswers=""
      imageUrl={imageUrl}
      onChange={onChange}
      onAcceptedAnswersChange={vi.fn()}
    />,
  );
  return { onChange };
};

describe("اكشفني authoring surface", () => {
  it("draws all six boxes on the item's own picture", () => {
    renderFields("https://cdn/celebrity.webp");
    const editor = screen.getByTestId("ekshifni-region-editor");
    expect(editor.querySelector("img")?.getAttribute("src")).toContain(
      "celebrity.webp",
    );
    for (const number of [1, 2, 3, 4, 5, 6]) {
      const box = screen.getByTestId(`ekshifni-preview-region-${number}`);
      expect(box).toHaveTextContent(String(number));
      // Positioned from the authored fractions, so the box is where it will be.
      expect(box.getAttribute("style")).toMatch(/left: \d/);
    }
  });

  it("asks for the picture before pretending to place anything", () => {
    renderFields(undefined);
    expect(screen.queryByTestId("ekshifni-region-editor")).toBeNull();
    expect(screen.getByTestId("ekshifni-preview-empty")).toHaveTextContent(
      "أضف صورة المشهور أولاً",
    );
  });

  it("highlights the region being edited, from the box or the field", () => {
    renderFields("https://cdn/celebrity.webp");
    fireEvent.click(screen.getByTestId("ekshifni-preview-region-4"));
    expect(screen.getByTestId("ekshifni-region-4").className).toContain(
      "border-primary",
    );
    fireEvent.focus(screen.getByLabelText("معرف الجزء 2"));
    expect(screen.getByTestId("ekshifni-region-2").className).toContain(
      "border-primary",
    );
  });

  it("previews the real board, and opens a window per region on demand", () => {
    // The same component the room renders, so an author checks the presentation
    // itself rather than a second reading of the same numbers.
    renderFields("https://cdn/celebrity.webp");
    const preview = screen.getByTestId("ekshifni-runtime-preview");
    const board = within(preview).getByTestId("ekshifni-board");
    expect(board).toHaveAttribute("data-obscured", "true");
    expect(within(board).queryByTestId("ekshifni-window-3")).toBeNull();

    fireEvent.click(screen.getByTestId("ekshifni-preview-toggle-3"));
    expect(within(board).getByTestId("ekshifni-window-3")).toBeInTheDocument();
    // Only that one: the rest of the face is still obscured.
    expect(within(board).queryByTestId("ekshifni-window-1")).toBeNull();
    expect(board).toHaveAttribute("data-obscured", "true");

    fireEvent.click(screen.getByTestId("ekshifni-preview-toggle-3"));
    expect(within(board).queryByTestId("ekshifni-window-3")).toBeNull();
  });

  it("moves the preview window when the authored geometry changes", () => {
    // Stateful on purpose: the property under test is that the preview is bound
    // to the authored numbers, which a mocked onChange would hide.
    function Stateful() {
      const [value, setValue] = useState(authored());
      return (
        <EkshifniFields
          value={value}
          acceptedAnswers=""
          imageUrl="https://cdn/celebrity.webp"
          onChange={setValue}
          onAcceptedAnswersChange={vi.fn()}
        />
      );
    }
    render(<Stateful />);
    fireEvent.click(screen.getByTestId("ekshifni-preview-toggle-1"));
    const windowOf = () =>
      screen
        .getByTestId("ekshifni-runtime-preview")
        .querySelector('[data-testid="ekshifni-window-1"]') as HTMLElement;
    const before = windowOf().style.left;
    fireEvent.change(screen.getByLabelText("س للجزء 1"), {
      target: { value: "0.55" },
    });
    expect(windowOf().style.left).toBe("55%");
    expect(windowOf().style.left).not.toBe(before);
  });

  it("keeps every geometry field labelled once it has a value", () => {
    // A placeholder vanishes exactly when the author starts comparing decimals.
    renderFields("https://cdn/celebrity.webp");
    const region = screen.getByTestId("ekshifni-region-1");
    for (const label of ["س", "ص", "العرض", "الارتفاع"]) {
      expect(region).toHaveTextContent(label);
    }
  });

  it("names the authoring roles, which players never see", () => {
    renderFields("https://cdn/celebrity.webp");
    expect(screen.getByLabelText("نوع الجزء 1")).toHaveValue("eyes");
    expect(screen.getByTestId("ekshifni-fields")).toHaveTextContent(
      EKSHIFNI_ROLE_LABEL.eyes,
    );
  });
});
