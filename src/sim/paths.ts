// Paths are pure functions of time, so moving objects carry no integrated
// state. That keeps the sim deterministic and makes rewinding trivial.

import { dcos, dsin, TURN } from './fixed';
import { TICKS_PER_SEC, type PathDef } from './types';

export interface CompiledPath {
  def: PathDef;
  /** Cumulative segment lengths for polylines. */
  cum: number[];
  total: number;
  /** Polyline points, closed if looping. */
  pts: [number, number][];
}

export function compilePath(def: PathDef): CompiledPath {
  const cum = [0];
  let total = 0;
  let pts: [number, number][] = [];
  if (def.type === 'polyline') {
    pts = def.mode === 'loop' ? [...def.points, def.points[0]] : def.points;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      total += Math.sqrt(dx * dx + dy * dy);
      cum.push(total);
    }
  } else {
    total = 2 * Math.PI * def.r;
  }
  return { def, cum, total, pts };
}

function cycle(def: PathDef, tick: number): number {
  const period = def.period > 0 ? def.period : 1;
  const u = tick / TICKS_PER_SEC / period + (def.phase ?? 0);
  const f = u % 1;
  return f < 0 ? f + 1 : f;
}

/** Position on a path at a (possibly fractional) tick. Writes into out. */
export function pathPos(p: CompiledPath, tick: number, out: { x: number; y: number }): void {
  const def = p.def;
  let u = cycle(def, tick);
  if (def.type === 'circle') {
    const a = Math.round(u * TURN) * (def.ccw ? -1 : 1);
    out.x = def.cx + def.r * dcos(a);
    out.y = def.cy + def.r * dsin(a);
    return;
  }
  const pts = p.pts;
  if (pts.length === 1 || p.total === 0) {
    out.x = pts[0][0];
    out.y = pts[0][1];
    return;
  }
  if (def.mode !== 'loop') {
    // Pingpong with a smooth ease at each end, so rails feel calm.
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;
    u = tri * tri * (3 - 2 * tri);
  }
  const d = u * p.total;
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const segLen = p.cum[i] - p.cum[i - 1];
  const t = segLen > 0 ? (d - p.cum[i - 1]) / segLen : 0;
  out.x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
  out.y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
}

/** Maximum speed along a path in world units per tick (for tunnelling guards). */
export function pathMaxSpeed(p: CompiledPath): number {
  const period = p.def.period > 0 ? p.def.period : 1;
  const perTick = p.total / (period * TICKS_PER_SEC);
  // Pingpong covers the length twice per period, and smoothstep peaks at 1.5x.
  return p.def.type === 'polyline' && p.def.mode !== 'loop' ? perTick * 3 : perTick;
}
