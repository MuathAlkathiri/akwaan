import { WorldContentValidationError } from './world-content.errors';
import { OddPieceNormalizedPoint } from './world-content.types';

export const ODD_PIECE_HOTSPOT_MIN_POINTS = 3;
export const ODD_PIECE_HOTSPOT_MAX_TOLERANCE = 0.25;
const EPSILON = 1e-9;

export type NormalizedPolygon = OddPieceNormalizedPoint[];

export function isNormalizedPoint(
  value: unknown,
): value is OddPieceNormalizedPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Partial<OddPieceNormalizedPoint>;
  return (
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

function cross(
  a: OddPieceNormalizedPoint,
  b: OddPieceNormalizedPoint,
  c: OddPieceNormalizedPoint,
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(
  a: OddPieceNormalizedPoint,
  b: OddPieceNormalizedPoint,
  point: OddPieceNormalizedPoint,
): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function segmentsIntersect(
  a: OddPieceNormalizedPoint,
  b: OddPieceNormalizedPoint,
  c: OddPieceNormalizedPoint,
  d: OddPieceNormalizedPoint,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) return true;
  if (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) return true;
  if (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) return true;
  if (Math.abs(cdB) <= EPSILON && onSegment(c, d, b)) return true;
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0;
}

function signedArea(polygon: NormalizedPolygon): number {
  return (
    polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

/** Returns descriptive validation failures rather than throwing. */
export function validateNormalizedPolygon(polygon: unknown): string[] {
  if (
    !Array.isArray(polygon) ||
    polygon.length < ODD_PIECE_HOTSPOT_MIN_POINTS
  ) {
    return [
      `polygon must contain at least ${ODD_PIECE_HOTSPOT_MIN_POINTS} points`,
    ];
  }
  const problems: string[] = [];
  polygon.forEach((point, index) => {
    if (!isNormalizedPoint(point))
      problems.push(`polygon point ${index} is not normalized`);
  });
  if (problems.length) return problems;
  const points = polygon as NormalizedPolygon;
  if (Math.abs(signedArea(points)) <= EPSILON)
    problems.push('polygon area must be greater than zero');
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    if (
      Math.abs(points[index].x - next.x) <= EPSILON &&
      Math.abs(points[index].y - next.y) <= EPSILON
    )
      problems.push('polygon edges must have non-zero length');
    for (let later = index + 1; later < points.length; later += 1) {
      if (
        Math.abs(points[index].x - points[later].x) <= EPSILON &&
        Math.abs(points[index].y - points[later].y) <= EPSILON
      )
        problems.push('polygon vertices must be unique');
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstEnd = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondEnd = (second + 1) % points.length;
      const adjacent =
        first === second || firstEnd === second || secondEnd === first;
      if (
        !adjacent &&
        segmentsIntersect(
          points[first],
          points[firstEnd],
          points[second],
          points[secondEnd],
        )
      ) {
        problems.push('polygon edges must not self-intersect');
      }
    }
  }
  return [...new Set(problems)];
}

export function validateHotspotTolerance(value: unknown): string[] {
  return typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > ODD_PIECE_HOTSPOT_MAX_TOLERANCE
    ? [`tolerance must be between 0 and ${ODD_PIECE_HOTSPOT_MAX_TOLERANCE}`]
    : [];
}

export function distancePointToSegment(
  point: OddPieceNormalizedPoint,
  start: OddPieceNormalizedPoint,
  end: OddPieceNormalizedPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** Boundary-inclusive point-in-polygon test for normalized coordinates. */
export function pointInNormalizedPolygon(
  point: OddPieceNormalizedPoint,
  polygon: NormalizedPolygon,
): boolean {
  if (validateNormalizedPolygon(polygon).length) return false;
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (onSegment(prior, current, point)) return true;
    const crosses = current.y > point.y !== prior.y > point.y;
    if (
      crosses &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
          (prior.y - current.y) +
          current.x
    )
      inside = !inside;
  }
  return inside;
}

/** Polygon hit-test with a bounded normalized tolerance around its boundary. */
export function pointWithinNormalizedPolygon(
  point: OddPieceNormalizedPoint,
  polygon: NormalizedPolygon,
  tolerance: number,
): boolean {
  if (
    !isNormalizedPoint(point) ||
    validateNormalizedPolygon(polygon).length ||
    validateHotspotTolerance(tolerance).length
  )
    return false;
  if (pointInNormalizedPolygon(point, polygon)) return true;
  if (tolerance === 0) return false;
  return polygon.some(
    (start, index) =>
      distancePointToSegment(
        point,
        start,
        polygon[(index + 1) % polygon.length],
      ) <=
      tolerance + EPSILON,
  );
}

export function assertNormalizedHotspot(
  polygon: unknown,
  tolerance: unknown,
): asserts polygon is NormalizedPolygon {
  const problems = [
    ...validateNormalizedPolygon(polygon),
    ...validateHotspotTolerance(tolerance),
  ];
  if (problems.length)
    throw new WorldContentValidationError([
      { code: 'ODD_PIECE_HOTSPOT_INVALID', message: problems.join('; ') },
    ]);
}
