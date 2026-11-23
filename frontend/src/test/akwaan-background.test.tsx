import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AkwaanBackground } from "@/components/akwaan/akwaan-background";

/**
 * The backdrop of the new identity.
 *
 * The three rendered planets this file used to measure were retired with the
 * old identity (2026-11-24), and the long dotted orbits that briefly replaced
 * them were removed the same night on the owner's call: on a scrolling page
 * they cut through the headline. What is guarded now is what remains true —
 * the backdrop is flat, drawn, quiet, and never content.
 */
describe("the Akwaan background", () => {
  it("ships no image file: the backdrop is drawn, not rendered", () => {
    render(<AkwaanBackground />);
    const root = screen.getByTestId("akwaan-background");
    expect(root.querySelectorAll("img")).toHaveLength(0);
  });

  it("draws no page-wide orbit lines", () => {
    render(<AkwaanBackground />);
    // Orbits belong to objects (a World's disc, the hero's planet), not to
    // the empty page.
    expect(document.querySelectorAll("ellipse")).toHaveLength(0);
  });

  it("uses flat fills only: no gradient, no blur", () => {
    render(<AkwaanBackground />);
    const root = screen.getByTestId("akwaan-background");
    expect(root.innerHTML).not.toContain("gradient");
    expect(root.innerHTML).not.toContain("blur");
  });

  it("scatters a few discs and sparks, and no more", () => {
    render(<AkwaanBackground />);
    const root = screen.getByTestId("akwaan-background");
    const pieces = root.children.length;
    expect(pieces).toBeGreaterThan(0);
    // A texture, not a scene: past a dozen it starts competing with content.
    expect(pieces).toBeLessThanOrEqual(12);
  });

  it("is decorative: no page can read it as content", () => {
    render(<AkwaanBackground />);
    const root = screen.getByTestId("akwaan-background");
    expect(root).toHaveAttribute("aria-hidden");
    expect(root.className).toContain("pointer-events-none");
  });
});
