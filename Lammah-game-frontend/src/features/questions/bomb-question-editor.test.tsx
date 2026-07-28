import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BombQuestionItem } from "@/types";
import { BombQuestionEditor } from "./components/bomb-question-editor";

const item = (index: number): BombQuestionItem => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  order: index,
  image: {
    url: `/uploads/questions/bomb-items/${index}.webp`,
    storageKey: `uploads/questions/bomb-items/${index}.webp`,
    mimetype: "image/webp",
    size: 100,
  },
  acceptedAnswers: [`answer-${index}`],
});

describe("BombQuestionEditor", () => {
  it("shows item count and adds items with stable IDs", () => {
    const onChange = vi.fn();
    render(
      <BombQuestionEditor
        items={Array.from({ length: 10 }, (_, index) => item(index))}
        onChange={onChange}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.getByText("10/10–15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إضافة عنصر" }));
    const next = onChange.mock.calls[0][0] as BombQuestionItem[];
    expect(next).toHaveLength(11);
    expect(next.slice(0, 10).map((entry) => entry.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => item(index).id),
    );
    expect(next[10].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("reorders without changing image or accepted-answer association", () => {
    const onChange = vi.fn();
    render(
      <BombQuestionEditor
        items={[item(0), item(1)]}
        onChange={onChange}
        onUpload={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "تحريك العنصر 1 لأسفل" }),
    );
    const next = onChange.mock.calls[0][0] as BombQuestionItem[];
    expect(next[0]).toMatchObject({
      id: item(1).id,
      image: item(1).image,
      acceptedAnswers: item(1).acceptedAnswers,
    });
  });

  it("flags duplicate accepted answers and supports answer removal", () => {
    render(
      <BombQuestionEditor
        items={[
          {
            ...item(0),
            acceptedAnswers: ["السعودية", " السعودية "],
          },
        ]}
        onChange={vi.fn()}
        onUpload={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("إجابة مكررة");
    expect(
      screen.getByRole("button", { name: "حذف الإجابة 2" }),
    ).toBeEnabled();
  });
});
