// Geometry helpers for collision. All functions are pure and allocation-light.

export interface Vec {
  x: number;
  y: number;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Squared distance from point P to segment AB. */
export function pointSegDist2(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = 0;
  if (len2 > 0) {
    t = ((px - ax) * abx + (py - ay) * aby) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return dist2(px, py, ax + abx * t, ay + aby * t);
}

/** Segment vs circle: does segment AB come within r of centre C? */
export function segCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number,
): boolean {
  return pointSegDist2(cx, cy, ax, ay, bx, by) <= r * r;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Do segments P1P2 and Q1Q2 properly intersect or touch? */
function segsIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  q1x: number, q1y: number, q2x: number, q2y: number,
): boolean {
  const rx = p2x - p1x, ry = p2y - p1y;
  const sx = q2x - q1x, sy = q2y - q1y;
  const denom = cross(rx, ry, sx, sy);
  if (denom === 0) return false; // parallel: the endpoint distance checks cover touching cases
  const qpx = q1x - p1x, qpy = q1y - p1y;
  const t = cross(qpx, qpy, sx, sy) / denom;
  const u = cross(qpx, qpy, rx, ry) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Squared minimum distance between segments P1P2 and Q1Q2. */
export function segSegDist2(
  p1x: number, p1y: number, p2x: number, p2y: number,
  q1x: number, q1y: number, q2x: number, q2y: number,
): number {
  if (segsIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y)) return 0;
  // Non-intersecting segments: the minimum is at one of the four endpoints.
  return Math.min(
    pointSegDist2(p1x, p1y, q1x, q1y, q2x, q2y),
    pointSegDist2(p2x, p2y, q1x, q1y, q2x, q2y),
    pointSegDist2(q1x, q1y, p1x, p1y, p2x, p2y),
    pointSegDist2(q2x, q2y, p1x, p1y, p2x, p2y),
  );
}

/** Capsule vs capsule (segment + radius each). */
export function capsuleHit(
  p1x: number, p1y: number, p2x: number, p2y: number, pr: number,
  q1x: number, q1y: number, q2x: number, q2y: number, qr: number,
): boolean {
  const r = pr + qr;
  return segSegDist2(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) <= r * r;
}
