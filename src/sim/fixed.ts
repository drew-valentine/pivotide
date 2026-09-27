// Deterministic angle math.
//
// Angles are integers in "turn units": one full turn = TURN. Integer angles
// wrap exactly and add without drift. Trig is done with polynomials built from
// + and * only, which IEEE-754 guarantees to round identically on every JS
// engine (unlike Math.sin/cos/atan2, which are implementation-approximated).

export const TURN = 1 << 20;
export const HALF = TURN >> 1;
export const QUARTER = TURN >> 2;
const EIGHTH = TURN >> 3;

const PI = 3.141592653589793;
const HALF_PI = PI / 2;
const QUARTER_PI = PI / 4;
const TAN_PI_8 = 0.41421356237309503;

/** Wrap into [0, TURN). */
export function norm(a: number): number {
  const r = a % TURN;
  return r < 0 ? r + TURN : r;
}

/** Wrap into [-HALF, HALF). */
export function wrapSigned(a: number): number {
  return norm(a + HALF) - HALF;
}

/** Taylor sin on [0, pi/2]; max error ~6e-8. */
function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))));
}

/** Taylor cos on [0, pi/2]; max error ~6e-9. */
function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600))))));
}

export function dsin(angle: number): number {
  const a = norm(Math.round(angle));
  const quadrant = (a / QUARTER) | 0;
  const x = ((a - quadrant * QUARTER) / QUARTER) * HALF_PI;
  switch (quadrant) {
    case 0: return sinPoly(x);
    case 1: return cosPoly(x);
    case 2: return -sinPoly(x);
    default: return -cosPoly(x);
  }
}

export function dcos(angle: number): number {
  return dsin(angle + QUARTER);
}

/** atan on [-tan(pi/8), tan(pi/8)]; max error ~2e-8. */
function atanSmall(t: number): number {
  const t2 = t * t;
  return t * (1 + t2 * (-1 / 3 + t2 * (1 / 5 + t2 * (-1 / 7 + t2 * (1 / 9 + t2 * (-1 / 11 + t2 * (1 / 13 + t2 * (-1 / 15))))))));
}

/** atan for t in [0, 1], in radians. */
function atanUnit(t: number): number {
  if (t <= TAN_PI_8) return atanSmall(t);
  return QUARTER_PI + atanSmall((t - 1) / (t + 1));
}

/**
 * Bearing of the vector (x, y) in integer turn units, [0, TURN).
 * With canvas coordinates (y down), increasing angle is clockwise on screen.
 */
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // First-octant angle in radians, then unfold.
  let r = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0) r = PI - r;
  if (y < 0) r = -r;
  return norm(Math.round((r / (2 * PI)) * TURN));
}

/** Turns per second → integer turn units per tick. */
export function turnsPerSecToUnits(turnsPerSec: number, ticksPerSec: number): number {
  return Math.round((turnsPerSec * TURN) / ticksPerSec);
}

export function unitsToRadians(a: number): number {
  return (a / TURN) * 2 * PI;
}

export { EIGHTH };
