// The simulation step. Pure: step(level, state, reverse) returns a new state
// and the events that happened during the tick. No DOM, clock, or randomness.

import { datan2, dcos, dsin, HALF, TURN, wrapSigned } from './fixed';
import { capsuleHit, dist2, segCircle } from './geom';
import { cloneState, pegPos, type CompiledHazard, type CompiledLevel } from './level';
import { pathPos } from './paths';
import { ROD_RADIUS, SPARK_RADIUS, TICKS_PER_SEC, type SimEvent, type WorldState } from './types';

const MAX_CAPTURES_PER_SUBSTEP = 8;

const tmpA = { x: 0, y: 0 };
const tmpB = { x: 0, y: 0 };
const tmpC = { x: 0, y: 0 };
const tmpD = { x: 0, y: 0 };

export interface Segment {
  x1: number; y1: number; x2: number; y2: number; r: number;
}

/** Hazard geometry at a (fractional) tick, as a capsule. Orbs are zero-length capsules. */
export function hazardShape(h: CompiledHazard, tick: number, out: Segment): Segment {
  const d = h.def;
  out.r = h.r;
  if (d.kind === 'wall') {
    out.x1 = d.x1; out.y1 = d.y1; out.x2 = d.x2; out.y2 = d.y2;
  } else if (d.kind === 'orb') {
    if (h.path) pathPos(h.path, tick, tmpD);
    else { tmpD.x = d.x; tmpD.y = d.y; }
    out.x1 = out.x2 = tmpD.x;
    out.y1 = out.y2 = tmpD.y;
  } else {
    const a = bladeAngle(d.spin, d.phase ?? 0, tick);
    const hx = (d.length / 2) * dcos(a);
    const hy = (d.length / 2) * dsin(a);
    out.x1 = d.x - hx; out.y1 = d.y - hy; out.x2 = d.x + hx; out.y2 = d.y + hy;
  }
  return out;
}

export function bladeAngle(spin: number, phase: number, tick: number): number {
  return Math.round((phase + (spin * tick) / TICKS_PER_SEC) * TURN);
}

/** Rod free-end position for a pivot position and angle. */
export function rodTip(px: number, py: number, angle: number, rod: number, out: { x: number; y: number }): void {
  out.x = px + rod * dcos(angle);
  out.y = py + rod * dsin(angle);
}

const seg: Segment = { x1: 0, y1: 0, x2: 0, y2: 0, r: 0 };

export function rodHitsHazard(level: CompiledLevel, px: number, py: number, tx: number, ty: number, tick: number): number {
  for (let i = 0; i < level.hazards.length; i++) {
    const h = level.hazards[i];
    hazardShape(h, tick, seg);
    const hit = h.def.kind === 'orb'
      ? segCircle(px, py, tx, ty, seg.x1, seg.y1, seg.r + ROD_RADIUS)
      : capsuleHit(px, py, tx, ty, ROD_RADIUS, seg.x1, seg.y1, seg.x2, seg.y2, seg.r);
    if (hit) return i;
  }
  return -1;
}

function insertSorted(arr: number[], v: number): void {
  let i = 0;
  while (i < arr.length && arr[i] < v) i++;
  if (arr[i] !== v) arr.splice(i, 0, v);
}

interface Capture {
  peg: number;
  frac: number;
  radial: number;
}

/**
 * Find the first peg whose bearing the rod crosses while rotating from a0
 * (time t0) to a1 (time t1). Handles moving pivots and moving pegs by
 * comparing signed bearings relative to the rod at both ends of the interval.
 */
export function findCapture(
  level: CompiledLevel, s: WorldState, a0: number, a1: number, t0: number, t1: number,
): Capture | null {
  pegPos(level, s.pivot, t0, tmpA);
  const p0x = tmpA.x, p0y = tmpA.y;
  pegPos(level, s.pivot, t1, tmpA);
  const p1x = tmpA.x, p1y = tmpA.y;
  const L = level.rod;
  let best: Capture | null = null;
  for (let j = 0; j < level.pegs.length; j++) {
    if (j === s.pivot) continue;
    if (j === s.last && !s.armed) continue;
    if (s.consumed.includes(j)) continue;
    pegPos(level, j, t1, tmpB);
    const d1 = Math.sqrt(dist2(tmpB.x, tmpB.y, p1x, p1y));
    const radial = Math.abs(d1 - L);
    if (radial > level.snap) continue;
    pegPos(level, j, t0, tmpC);
    const b0 = datan2(tmpC.y - p0y, tmpC.x - p0x);
    const b1 = datan2(tmpB.y - p1y, tmpB.x - p1x);
    const s0 = s.dir * wrapSigned(b0 - a0);
    const s1 = s.dir * wrapSigned(b1 - a1);
    // Crossing: the peg is ahead of (or on) the rod at the start, and on or behind it at the end.
    if (s0 < 0 || s1 > 0 || s0 - s1 > HALF / 2) continue;
    const frac = s0 === s1 ? 0 : s0 / (s0 - s1);
    if (
      best === null ||
      frac < best.frac ||
      (frac === best.frac && radial < best.radial)
    ) {
      best = { peg: j, frac, radial };
    }
  }
  return best;
}

/**
 * Advance one fixed tick. `reverse` flips the rotation direction before
 * moving. Returns a fresh state; the input state is not mutated.
 */
export function step(level: CompiledLevel, input: WorldState, reverse: boolean): { state: WorldState; events: SimEvent[] } {
  const s = cloneState(input);
  const events: SimEvent[] = [];
  if (s.status !== 'playing') return { state: s, events };

  if (reverse) {
    s.dir = s.dir === 1 ? -1 : 1;
    events.push({ type: 'reverse', dir: s.dir });
  }

  const n = level.substeps;
  const L = level.rod;
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    let t0 = s.tick + i / n;
    const t1 = s.tick + (i + 1) / n;
    const v = level.pegs[s.pivot].speed;
    let remaining = Math.floor(((i + 1) * v) / n) - Math.floor((i * v) / n);

    for (let c = 0; c <= MAX_CAPTURES_PER_SUBSTEP; c++) {
      const a0 = s.angle;
      const a1 = s.angle + s.dir * remaining;
      const cap = c < MAX_CAPTURES_PER_SUBSTEP ? findCapture(level, s, a0, a1, t0, t1) : null;
      if (!cap) {
        s.angle = a1;
        break;
      }
      // Transfer: the captured peg becomes the pivot; the rod now points back at the old one.
      const used = Math.round(remaining * cap.frac);
      const tc = t0 + (t1 - t0) * cap.frac;
      const from = s.pivot;
      const oldSpeed = level.pegs[from].speed;
      pegPos(level, from, tc, tmpA);
      pegPos(level, cap.peg, tc, tmpB);
      remaining -= used;
      if (level.pegs[from].kind === 'once') {
        insertSorted(s.consumed, from);
        events.push({ type: 'consume', peg: from });
      }
      s.pivot = cap.peg;
      s.angle = datan2(tmpA.y - tmpB.y, tmpA.x - tmpB.x);
      s.last = from;
      s.armed = false;
      events.push({ type: 'pivot', peg: cap.peg, from, dir: s.dir });

      const peg = level.pegs[cap.peg];
      if (peg.kind === 'goal') {
        s.status = 'won';
        events.push({ type: 'won', peg: cap.peg });
        break;
      }
      if (peg.kind === 'portal' && peg.pair >= 0) {
        events.push({ type: 'portal', from: cap.peg, to: peg.pair });
        s.pivot = peg.pair;
      }
      if (peg.kind === 'reverse') {
        s.dir = s.dir === 1 ? -1 : 1;
        events.push({ type: 'reverse', dir: s.dir });
      }
      const newSpeed = level.pegs[s.pivot].speed;
      if (newSpeed !== oldSpeed && oldSpeed > 0) remaining = Math.round((remaining * newSpeed) / oldSpeed);
      t0 = tc;
    }
    if (s.status !== 'playing') break;

    pegPos(level, s.pivot, t1, tmpA);
    rodTip(tmpA.x, tmpA.y, s.angle, L, tmpB);

    // Re-arm the previous pivot once the free end is far enough from it. Until
    // then the rod passes over it, so a quick tap after landing turns the rod
    // around the new pivot instead of swinging straight back.
    if (!s.armed && s.last >= 0) {
      pegPos(level, s.last, t1, tmpC);
      if (dist2(tmpB.x, tmpB.y, tmpC.x, tmpC.y) > level.arm * level.arm) s.armed = true;
    }

    // Sparks are gathered by any part of the rod.
    const sparks = level.def.sparks ?? [];
    for (let k = 0; k < sparks.length; k++) {
      if (s.sparks.includes(k)) continue;
      if (segCircle(tmpA.x, tmpA.y, tmpB.x, tmpB.y, sparks[k].x, sparks[k].y, SPARK_RADIUS + ROD_RADIUS)) {
        insertSorted(s.sparks, k);
        events.push({ type: 'spark', spark: k });
      }
    }

    const hit = rodHitsHazard(level, tmpA.x, tmpA.y, tmpB.x, tmpB.y, t1);
    if (hit >= 0) {
      s.status = 'hit';
      s.hitHazard = hit;
      events.push({ type: 'hit', hazard: hit });
    }
  }
  s.tick++;
  return { state: s, events };
}

/** Angle normalised to [0, TURN) for display. */
export function displayAngle(a: number): number {
  const r = a % TURN;
  return r < 0 ? r + TURN : r;
}
