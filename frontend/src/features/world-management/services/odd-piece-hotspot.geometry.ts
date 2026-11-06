export interface NormalizedHotspotPoint {
  x: number;
  y: number;
}

export const ODD_PIECE_HOTSPOT_MAX_TOLERANCE = 0.25;
const EPSILON = 1e-9;

export function isNormalizedHotspotPoint(
  value: unknown,
): value is NormalizedHotspotPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<NormalizedHotspotPoint>;
  return (
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

function cross(
  a: NormalizedHotspotPoint,
  b: NormalizedHotspotPoint,
  c: NormalizedHotspotPoint,
) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(
  a: NormalizedHotspotPoint,
  b: NormalizedHotspotPoint,
  point: NormalizedHotspotPoint,
) {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function segmentsIntersect(
  a: NormalizedHotspotPoint,
  b: NormalizedHotspotPoint,
  c: NormalizedHotspotPoint,
  d: NormalizedHotspotPoint,
) {
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

function signedArea(points: NormalizedHotspotPoint[]) {
  return (
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

export function validateNormalizedHotspotPolygon(polygon: unknown): string[] {
  if (!Array.isArray(polygon) || polygon.length < 3)
    return ["أضف ثلاث نقاط على الأقل للمضلع."];
  const problems: string[] = [];
  polygon.forEach((point, index) => {
    if (!isNormalizedHotspotPoint(point))
      problems.push(`النقطة ${index + 1} خارج نطاق الصورة.`);
  });
  if (problems.length) return problems;
  const points = polygon as NormalizedHotspotPoint[];
  if (Math.abs(signedArea(points)) <= EPSILON)
    problems.push("منطقة الإجابة يجب أن تكون غير منعدمة.");
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    if (
      Math.abs(points[index].x - next.x) <= EPSILON &&
      Math.abs(points[index].y - next.y) <= EPSILON
    )
      problems.push("لا يمكن تكرار نقاط المضلع.");
    for (let later = index + 1; later < points.length; later += 1) {
      if (
        Math.abs(points[index].x - points[later].x) <= EPSILON &&
        Math.abs(points[index].y - points[later].y) <= EPSILON
      )
        problems.push("لا يمكن تكرار نقاط المضلع.");
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
      )
        problems.push("لا يمكن أن تتقاطع حواف المضلع.");
    }
  }
  return [...new Set(problems)];
}

export function validateHotspotTolerance(value: unknown): string[] {
  return typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > ODD_PIECE_HOTSPOT_MAX_TOLERANCE
    ? [`التسامح يجب أن يكون بين 0 و${ODD_PIECE_HOTSPOT_MAX_TOLERANCE}.`]
    : [];
}

function distancePointToSegment(
  point: NormalizedHotspotPoint,
  start: NormalizedHotspotPoint,
  end: NormalizedHotspotPoint,
) {
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

export function pointWithinHotspot(
  point: NormalizedHotspotPoint,
  polygon: NormalizedHotspotPoint[],
  tolerance: number,
) {
  if (
    !isNormalizedHotspotPoint(point) ||
    validateNormalizedHotspotPolygon(polygon).length ||
    validateHotspotTolerance(tolerance).length
  )
    return false;
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
  if (inside || tolerance === 0) return inside;
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

export function normalizedPointFromClient(
  event: { clientX: number; clientY: number },
  element: HTMLElement,
  width: number,
  height: number,
): NormalizedHotspotPoint {
  const rect = element.getBoundingClientRect();
  const scale = Math.min(rect.width / width, rect.height / height);
  const displayedWidth = width * scale;
  const displayedHeight = height * scale;
  const offsetX = (rect.width - displayedWidth) / 2;
  const offsetY = (rect.height - displayedHeight) / 2;
  return {
    x: Math.max(
      0,
      Math.min(1, (event.clientX - rect.left - offsetX) / displayedWidth),
    ),
    y: Math.max(
      0,
      Math.min(1, (event.clientY - rect.top - offsetY) / displayedHeight),
    ),
  };
}
