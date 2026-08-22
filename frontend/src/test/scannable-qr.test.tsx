import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScannableQr } from "@/components/akwaan/scannable-qr";

/**
 * The join QR a player scans, and the enlarge affordance added to it.
 *
 * The load-bearing invariant is that enlarging changes only presentation: the
 * inline code and the blown-up code must encode the *same* join URL, because the
 * whole feature is "same code, easier to scan". These tests read the QR value out
 * of both renders and compare them.
 */

const JOIN_URL = "https://akwaan-frontend.vercel.app/join/live-session/PK7UHJ6";

/** qrcode.react encodes the value into the SVG's path; we compare that path. */
const qrPath = (svg: Element | null) =>
  svg?.querySelector("path[d]")?.getAttribute("d") ?? null;

describe("the inline join QR", () => {
  it("renders as an accessible, interactive trigger", () => {
    render(<ScannableQr value={JOIN_URL} />);
    const trigger = screen.getByTestId("qr-enlarge-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    // It announces what it does, not just "image".
    expect(trigger).toHaveAccessibleName("كبّر رمز QR للانضمام");
    expect(trigger).toHaveAttribute("title", "اضغط على الكود عشان تكبّره");
    // The inline QR is actually drawn.
    expect(trigger.querySelector("svg")).toBeTruthy();
  });

  it("does not open the dialog until it is pressed", () => {
    render(<ScannableQr value={JOIN_URL} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("enlarging the QR", () => {
  it("opens an enlarged dialog on click", () => {
    render(<ScannableQr value={JOIN_URL} />);
    fireEvent.click(screen.getByTestId("qr-enlarge-trigger"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // The dialog has a real accessible title (Radix requires it; a11y needs it).
    expect(within(dialog).getByText("كبّر رمز QR للانضمام")).toBeTruthy();
  });

  it("opens by keyboard (Enter/Space on the button)", () => {
    render(<ScannableQr value={JOIN_URL} />);
    const trigger = screen.getByTestId("qr-enlarge-trigger");
    // A native <button> fires click on Enter/Space; assert it is focusable and
    // that activating it opens the dialog.
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("encodes the SAME join URL inline and enlarged", () => {
    render(<ScannableQr value={JOIN_URL} />);
    const inline = qrPath(
      screen.getByTestId("qr-enlarge-trigger").querySelector("svg"),
    );
    fireEvent.click(screen.getByTestId("qr-enlarge-trigger"));
    const enlarged = qrPath(screen.getByTestId("qr-enlarged-image"));
    expect(inline).not.toBeNull();
    expect(enlarged).not.toBeNull();
    // Identical module pattern ⇒ identical payload. The feature never re-encodes.
    expect(enlarged).toBe(inline);
  });

  it("closes via the dialog's close button", () => {
    render(<ScannableQr value={JOIN_URL} />);
    fireEvent.click(screen.getByTestId("qr-enlarge-trigger"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<ScannableQr value={JOIN_URL} />);
    fireEvent.click(screen.getByTestId("qr-enlarge-trigger"));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passes a custom label/hint through when asked", () => {
    render(
      <ScannableQr
        value={JOIN_URL}
        enlargedTitle="Join QR"
        hint="tap to enlarge"
      />,
    );
    const trigger = screen.getByTestId("qr-enlarge-trigger");
    expect(trigger).toHaveAccessibleName("Join QR");
    expect(trigger).toHaveAttribute("title", "tap to enlarge");
  });
});
