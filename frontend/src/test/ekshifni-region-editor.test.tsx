import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EkshifniRegionEditor } from "@/features/world-management/components/content-items/ekshifni-region-editor";
import {
  EKSHIFNI_REGION_ROLES,
  type EkshifniFormState,
} from "@/features/world-management/services/content-item-form.service";

/**
 * Placing the six windows by dragging them.
 *
 * Every assertion here is about one property: what the author moves on screen
 * and what gets stored must be the same rectangle, expressed as a fraction of
 * the picture. Pixels never survive a pointer event — that is what keeps an
 * authored window on the same eye on a television and on a phone — and a box
 * can be pushed to an edge but never off the image, so geometry that validates
 * before a drag still validates after one.
 */

/** jsdom gives every element a zero-sized rect, so the frame is stated here. */
const FRAME = { left: 100, top: 50, width: 400, height: 200 };

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...FRAME,
    right: FRAME.left + FRAME.width,
    bottom: FRAME.top + FRAME.height,
    x: FRAME.left,
    y: FRAME.top,
    toJSON: () => ({}),
  } as DOMRect);
});

/** A fraction of the picture, expressed as a client point inside the frame. */
const at = (fx: number, fy: number) => ({
  clientX: FRAME.left + fx * FRAME.width,
  clientY: FRAME.top + fy * FRAME.height,
});

/**
 * jsdom has no PointerEvent, so Testing Library drops the coordinates that this
 * component exists to read. Dispatching the event with them attached is what
 * makes the drag arithmetic observable at all.
 */
const pointer = (
  type: "pointerdown" | "pointermove" | "pointerup",
  element: Element,
  point: { clientX: number; clientY: number },
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { ...point, pointerId: 1, button: 0 });
  // Through fireEvent so React flushes the state each step sets before the next
  // event reads it.
  fireEvent(element, event);
};

const regions = (): EkshifniFormState["regions"] =>
  EKSHIFNI_REGION_ROLES.map((role, index) => ({
    localId: `region-${index + 1}`,
    role,
    x: "0.20",
    y: "0.20",
    width: "0.20",
    height: "0.20",
  }));

const renderEditor = (overrides: Partial<EkshifniFormState["regions"][number]> = {}) => {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const list = regions();
  list[0] = { ...list[0], ...overrides };
  render(
    <EkshifniRegionEditor
      regions={list}
      imageUrl="https://cdn/celebrity.webp"
      activeIndex={0}
      onSelect={onSelect}
      onChange={onChange}
    />,
  );
  return { onChange, onSelect };
};

const lastBox = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[1];

const drag = (element: Element, from: [number, number], to: [number, number]) => {
  const frame = screen.getByTestId("ekshifni-region-editor");
  pointer("pointerdown", element, at(...from));
  pointer("pointermove", frame, at(...to));
  pointer("pointerup", frame, at(...to));
};

describe("the اكشفني region editor", () => {
  it("renders the picture with a box per canonical region", () => {
    renderEditor();
    const editor = screen.getByTestId("ekshifni-region-editor");
    expect(editor.querySelector("img")?.getAttribute("src")).toContain(
      "celebrity.webp",
    );
    for (const number of [1, 2, 3, 4, 5, 6]) {
      expect(
        screen.getByTestId(`ekshifni-preview-region-${number}`),
      ).toHaveTextContent(String(number));
    }
  });

  it("marks the selected region and names its authoring role", () => {
    renderEditor();
    const first = screen.getByTestId("ekshifni-preview-region-1");
    expect(first).toHaveAttribute("data-active", "true");
    expect(first).toHaveTextContent("العينان");
    expect(
      screen.getByTestId("ekshifni-preview-region-2"),
    ).toHaveAttribute("data-active", "false");
  });

  it("selects a region on click, without needing a drag", () => {
    const { onSelect } = renderEditor();
    fireEvent.click(screen.getByTestId("ekshifni-preview-region-4"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("turns a drag into fractional coordinates", () => {
    const { onChange } = renderEditor();
    // Grab the box at its own position and move a tenth of the picture right
    // and a twentieth down.
    drag(screen.getByTestId("ekshifni-preview-region-1"), [0.2, 0.2], [0.3, 0.25]);
    expect(lastBox(onChange)).toEqual({
      x: 0.3,
      y: 0.25,
      width: 0.2,
      height: 0.2,
    });
  });

  it("resizes from a corner, pinning the opposite one", () => {
    const { onChange } = renderEditor();
    // The south-east handle: the north-west corner must not move.
    drag(screen.getByTestId("ekshifni-handle-1-se"), [0.4, 0.4], [0.6, 0.5]);
    expect(lastBox(onChange)).toEqual({
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.3,
    });
  });

  it("resizes from the north-west corner, pinning the south-east one", () => {
    const { onChange } = renderEditor();
    drag(screen.getByTestId("ekshifni-handle-1-nw"), [0.2, 0.2], [0.1, 0.1]);
    // Right/bottom edges stayed at 0.40; the box grew up and left.
    const box = lastBox(onChange);
    expect(box.x).toBeCloseTo(0.1, 4);
    expect(box.y).toBeCloseTo(0.1, 4);
    expect(box.x + box.width).toBeCloseTo(0.4, 4);
    expect(box.y + box.height).toBeCloseTo(0.4, 4);
  });

  it("cannot be dragged off the picture", () => {
    const { onChange } = renderEditor();
    // Hauled far past the bottom-right corner.
    drag(screen.getByTestId("ekshifni-preview-region-1"), [0.2, 0.2], [5, 5]);
    const box = lastBox(onChange);
    expect(box.x + box.width).toBeLessThanOrEqual(1);
    expect(box.y + box.height).toBeLessThanOrEqual(1);
    expect(box.width).toBeCloseTo(0.2, 4);
    expect(box.height).toBeCloseTo(0.2, 4);
  });

  it("cannot be dragged past the top-left corner either", () => {
    const { onChange } = renderEditor();
    drag(screen.getByTestId("ekshifni-preview-region-1"), [0.2, 0.2], [-5, -5]);
    expect(lastBox(onChange)).toMatchObject({ x: 0, y: 0 });
  });

  it("cannot be resized inside out", () => {
    const { onChange } = renderEditor();
    // Dragging the south-east handle far past the north-west corner.
    drag(screen.getByTestId("ekshifni-handle-1-se"), [0.4, 0.4], [-1, -1]);
    const box = lastBox(onChange);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.x).toBeCloseTo(0.2, 4);
    expect(box.y).toBeCloseTo(0.2, 4);
  });

  it("asks for the picture before pretending to place anything", () => {
    render(
      <EkshifniRegionEditor
        regions={regions()}
        activeIndex={0}
        onSelect={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("ekshifni-region-editor")).toBeNull();
    expect(screen.getByTestId("ekshifni-preview-empty")).toHaveTextContent(
      "أضف صورة المشهور أولاً",
    );
  });

  it("positions each box from its own fractions", () => {
    renderEditor({ x: "0.5", y: "0.25", width: "0.1", height: "0.4" });
    expect(screen.getByTestId("ekshifni-preview-region-1")).toHaveStyle({
      left: "50%",
      top: "25%",
      width: "10%",
      height: "40%",
    });
  });

  it("keeps the six roles distinct and labelled", () => {
    renderEditor();
    const first = screen.getByTestId("ekshifni-preview-region-1");
    expect(within(first).getByText("العينان")).toBeInTheDocument();
  });
});
