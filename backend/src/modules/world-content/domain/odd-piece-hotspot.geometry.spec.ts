import {
  pointInNormalizedPolygon,
  pointWithinNormalizedPolygon,
  validateHotspotTolerance,
  validateNormalizedPolygon,
} from './odd-piece-hotspot.geometry';

describe('Odd Piece V2 hotspot geometry', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ];

  it('accepts interior, boundary and tolerance hits', () => {
    expect(pointInNormalizedPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInNormalizedPolygon({ x: 0.2, y: 0.5 }, square)).toBe(true);
    expect(
      pointWithinNormalizedPolygon({ x: 0.19, y: 0.5 }, square, 0.02),
    ).toBe(true);
    expect(pointWithinNormalizedPolygon({ x: 0.1, y: 0.5 }, square, 0.02)).toBe(
      false,
    );
  });

  it('handles a concave polygon without treating its notch as inside', () => {
    const concave = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.9 },
    ];
    expect(pointInNormalizedPolygon({ x: 0.2, y: 0.2 }, concave)).toBe(true);
    expect(pointInNormalizedPolygon({ x: 0.7, y: 0.7 }, concave)).toBe(true);
    expect(pointInNormalizedPolygon({ x: 0.45, y: 0.6 }, concave)).toBe(false);
  });

  it('rejects malformed, degenerate, self-intersecting and out-of-range polygons', () => {
    expect(
      validateNormalizedPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedPolygon([
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedPolygon([
        { x: -0.1, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).not.toEqual([]);
    expect(
      validateNormalizedPolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).not.toEqual([]);
    expect(validateHotspotTolerance(-0.01)).not.toEqual([]);
    expect(validateHotspotTolerance(0.25)).toEqual([]);
    expect(validateHotspotTolerance(0.26)).not.toEqual([]);
  });
});
