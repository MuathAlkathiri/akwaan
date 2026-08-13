import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BidiText, bidiSegments } from "@/components/akwaan/bidi-text";

/**
 * The reversed-range bug, pinned.
 *
 * `موسم 2003-04` rendered as `موسم 04-2003` in the shipped build. Nothing threw and
 * nothing looked broken; the season was simply wrong on a screen a room was reading.
 * That is the whole class of defect this component exists to remove, so the tests
 * assert on *order* rather than on markup.
 */
describe("isolating Latin and numeric runs inside Arabic", () => {
  it("keeps a hyphenated range in its authored order", () => {
    const segments = bidiSegments("موسم 2003-04");
    expect(segments).toEqual([
      { text: "موسم ", ltr: false },
      { text: "2003-04", ltr: true },
    ]);
  });

  it("treats the punctuation that binds a run as part of it", () => {
    // Fragmenting `3/4` into `3`, `/`, `4` reverses it just as thoroughly.
    for (const run of ["3/4", "12:30", "v1.2", "1,500", "2-1", "45%"]) {
      const segments = bidiSegments(`النتيجة ${run} نهائية`);
      expect(segments.filter((segment) => segment.ltr)).toEqual([
        { text: run, ltr: true },
      ]);
    }
  });

  it("isolates several runs in one sentence independently", () => {
    const segments = bidiSegments("EPL 2003-04 مقابل UCL 2010-11");
    expect(segments.filter((segment) => segment.ltr).map((s) => s.text)).toEqual([
      "EPL 2003-04",
      "UCL 2010-11",
    ]);
  });

  it("wraps each run as its own isolated LTR island", () => {
    const { container } = render(<BidiText>{"موسم 2003-04"}</BidiText>);
    const islands = container.querySelectorAll('[dir="ltr"]');
    expect(islands).toHaveLength(1);
    expect(islands[0].textContent).toBe("2003-04");
    // The Arabic around it is untouched and still flows with the paragraph.
    expect(container.textContent).toBe("موسم 2003-04");
  });

  it("adds no markup to text that has nothing to isolate", () => {
    const { container } = render(<BidiText>من هو الهداف؟</BidiText>);
    expect(container.querySelectorAll("[dir]")).toHaveLength(0);
    expect(container.textContent).toBe("من هو الهداف؟");
  });

  it("renders a number or an absent value without failing", () => {
    expect(render(<BidiText>{2024}</BidiText>).container.textContent).toBe("2024");
    expect(render(<BidiText>{null}</BidiText>).container.textContent).toBe("");
    expect(render(<BidiText>{undefined}</BidiText>).container.textContent).toBe("");
  });
});
