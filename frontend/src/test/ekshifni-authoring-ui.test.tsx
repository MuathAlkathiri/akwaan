import { fireEvent, render, screen } from "@testing-library/react";
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
    const preview = screen.getByTestId("ekshifni-preview");
    expect(preview.querySelector("img")?.getAttribute("src")).toContain(
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
    expect(screen.queryByTestId("ekshifni-preview")).toBeNull();
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
