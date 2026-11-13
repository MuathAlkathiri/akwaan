import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AkwaanBackground } from "@/components/akwaan/akwaan-background";

/**
 * The background is one system, and these are the rules that make it one.
 *
 * They are checked against what renders, not against the source text, because
 * the guarantee is geometric: a planet must sit *on* its orbit. A test that
 * only counted `<svg>` tags would pass just as happily with every planet
 * floating beside its ring, which is exactly the state this arrangement
 * replaced.
 */

const px = (value: string) => Number.parseFloat(value.replace("px", ""));

function stations() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-station]"),
  ).map((frame) => {
    const image = frame.querySelector<HTMLImageElement>("img")!;
    const ellipse = frame.querySelector<SVGEllipseElement>("ellipse")!;
    const width = px(image.style.width);
    const height = px(image.style.height);
    return {
      key: frame.dataset.station!,
      src: image.getAttribute("src") ?? "",
      opacity: Number.parseFloat(image.style.opacity),
      size: width,
      square: width === height,
      centre: {
        x: px(image.style.left) + width / 2,
        y: px(image.style.top) + height / 2,
      },
      orbit: {
        cx: Number(ellipse.getAttribute("cx")),
        cy: Number(ellipse.getAttribute("cy")),
        rx: Number(ellipse.getAttribute("rx")),
        ry: Number(ellipse.getAttribute("ry")),
        transform: ellipse.getAttribute("transform") ?? "",
      },
    };
  });
}

/** 1 exactly when the point lies on the ellipse. */
function onOrbit(station: ReturnType<typeof stations>[number]) {
  const tilt = Number(station.orbit.transform.match(/rotate\(([-\d.]+)/)![1]);
  const t = (tilt * Math.PI) / 180;
  const dx = station.centre.x - station.orbit.cx;
  const dy = station.centre.y - station.orbit.cy;
  const u = dx * Math.cos(t) + dy * Math.sin(t);
  const v = -dx * Math.sin(t) + dy * Math.cos(t);
  return (u / station.orbit.rx) ** 2 + (v / station.orbit.ry) ** 2;
}

describe("the Akwaan background", () => {
  it("keeps the three approved planets", () => {
    render(<AkwaanBackground />);
    const found = stations();
    expect(found).toHaveLength(3);
    for (const station of found) {
      // next/image rewrites the src through its optimizer, so decode it back.
      expect(decodeURIComponent(station.src)).toContain("/brand/cosmic/");
      expect(station.square).toBe(true);
    }
  });

  it("puts every planet on its own orbit, not beside it", () => {
    render(<AkwaanBackground />);
    for (const station of stations()) {
      // Within half a percent of the path: this is arithmetic, not taste.
      expect(onOrbit(station)).toBeCloseTo(1, 2);
    }
  });

  it("draws every orbit on one celestial plane", () => {
    render(<AkwaanBackground />);
    const tilts = new Set(
      Array.from(document.querySelectorAll("ellipse")).map(
        (ellipse) => ellipse.getAttribute("transform")?.match(/rotate\(([-\d.]+)/)?.[1],
      ),
    );
    expect(tilts.size).toBe(1);
    // Two rings per station: the drawn orbit and its dashed companion.
    expect(document.querySelectorAll("ellipse")).toHaveLength(6);
  });

  it("ladders size and opacity together, so bigger reads as nearer", () => {
    render(<AkwaanBackground />);
    const bySize = [...stations()].sort((a, b) => b.size - a.size);
    expect(bySize.map((station) => station.size)).toEqual([96, 80, 64]);
    // The smallest is the faintest; nothing is louder than the nearest planet.
    expect(bySize[2].opacity).toBeLessThan(bySize[0].opacity);
    for (const station of bySize) {
      expect(station.opacity).toBeLessThan(0.2);
    }
  });

  it("is decorative: no page can read it as content", () => {
    render(<AkwaanBackground />);
    const root = screen.getByTestId("akwaan-background");
    expect(root).toHaveAttribute("aria-hidden");
    expect(root.className).toContain("pointer-events-none");
    for (const image of root.querySelectorAll("img")) {
      expect(image.getAttribute("alt")).toBe("");
    }
  });
});
