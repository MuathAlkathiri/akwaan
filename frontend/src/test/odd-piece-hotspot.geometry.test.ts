import { describe, expect, it } from "vitest";
import {
  normalizedPointFromClient,
  pointWithinHotspot,
  validateHotspotTolerance,
  validateNormalizedHotspotPolygon,
} from "@/features/world-management/services/odd-piece-hotspot.geometry";

describe("Odd Piece V2 hotspot geometry", () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];

  it("matches the backend boundary and normalized tolerance semantics", () => {
    expect(pointWithinHotspot({ x: 0.5, y: 0.5 }, square, 0)).toBe(true);
    expect(pointWithinHotspot({ x: 0.2, y: 0.5 }, square, 0)).toBe(true);
    expect(pointWithinHotspot({ x: 0.19, y: 0.5 }, square, 0.02)).toBe(true);
    expect(pointWithinHotspot({ x: 0.1, y: 0.5 }, square, 0.02)).toBe(false);
  });

  it("rejects degenerate, self-intersecting and out-of-range polygons", () => {
    expect(
      validateNormalizedHotspotPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedHotspotPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedHotspotPolygon([
        { x: -0.1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).not.toEqual([]);
  });

  it("keeps tolerance bounded and maps letterboxed client coordinates", () => {
    expect(validateHotspotTolerance(0.25)).toEqual([]);
    expect(validateHotspotTolerance(0.26)).not.toEqual([]);
    const element = {
      getBoundingClientRect: () =>
        ({ left: 100, top: 50, width: 500, height: 500 }) as DOMRect,
    } as HTMLElement;
    // A 1200x800 image is displayed at 500x333.33 with 83.33px vertical bars.
    expect(
      normalizedPointFromClient(
        { clientX: 350, clientY: 300 },
        element,
        1200,
        800,
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
  });
});
