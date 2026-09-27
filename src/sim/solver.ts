// Level solver: finds a run with the fewest reversals, using the real sim.
//
// Search nodes are the moments the rod lands on a peg (plus the start). From
// each node we simulate the no-press path once, then branch by pressing at
// sampled tick offsets along it. A 0-1 BFS (no-press edges cost 0, press edges
// cost 1) returns the minimum-press solution. Used by tests to prove every
// level is solvable and by the editor to suggest par values.

import { TURN } from './fixed';
import { initialState, type CompiledLevel } from './level';
import { step } from './step';
import { TICKS_PER_SEC, type WorldState } from './types';

export interface Solution {
  presses: number[];
  moves: number;
  ticks: number;
  sparks: number;
}

export interface SolveOptions {
  /** Tick spacing between candidate press moments (default 3). */
  sample?: number;
  /** Stop after this many expanded nodes (default 6000). */
  maxNodes?: number;
  /** Require collecting every spark. */
  allSparks?: boolean;
  /** Give up after this much wall time (default: no limit). */
  timeLimitMs?: number;
}

interface Node {
  state: WorldState;
  presses: number[];
}

/** Ticks after which all moving scenery repeats (capped), or 0 for static levels. */
function cyclePeriod(level: CompiledLevel): number {
  const periods: number[] = [];
  for (const p of level.pegs) if (p.path) periods.push(p.path.def.period);
  for (const h of level.hazards) {
    if (h.path) periods.push(h.path.def.period);
    if (h.def.kind === 'blade' && h.def.spin !== 0) periods.push(1 / Math.abs(h.def.spin) / 2); // bars are symmetric
  }
  if (!periods.length) return 0;
  const ticks = periods.map((s) => Math.max(1, Math.round(s * TICKS_PER_SEC)));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let l = ticks[0];
  for (const t of ticks.slice(1)) {
    l = (l / gcd(l, t)) * t;
    if (l > TICKS_PER_SEC * 120) return TICKS_PER_SEC * 120;
  }
  return l;
}

function keyOf(s: WorldState, period: number): string {
  const a = Math.round((((s.angle % TURN) + TURN) % TURN) / 4096);
  // Moving scenery makes time part of the state; fold it into the motion cycle
  // and bucket it to keep the search finite.
  const t = period ? `|${Math.floor((s.tick % period) / 10)}` : '';
  return `${s.pivot}|${s.last}|${s.armed ? 1 : 0}|${s.dir}|${a}|${s.consumed.join(',')}|${s.sparks.join(',')}${t}`;
}

export function solve(level: CompiledLevel, opts: SolveOptions = {}): Solution | null {
  const sample = opts.sample ?? 3;
  const maxNodes = opts.maxNodes ?? 6000;
  const nSparks = level.def.sparks?.length ?? 0;
  const dynamic = cyclePeriod(level);
  // Longest we will wait for a landing: a little over one full turn at the slowest peg speed.
  const minSpeed = Math.max(1, Math.min(...level.pegs.map((p) => p.speed)));
  const horizon = Math.ceil((TURN / minSpeed) * 1.05) + 2;

  // Layered 0-1 BFS: `layer` holds nodes reachable with `cost` presses.
  let layer: Node[] = [{ state: initialState(level), presses: [] }];
  let next: Node[] = [];
  const seen = new Map<string, number>([[keyOf(layer[0].state, dynamic), 0]]);
  let expanded = 0;
  let best: Solution | null = null;

  const done = (s: WorldState) => s.status === 'won' && (!opts.allSparks || s.sparks.length === nSparks);

  const deadline = opts.timeLimitMs ? performance.now() + opts.timeLimitMs : Infinity;
  let qi = 0;
  while (expanded < maxNodes) {
    if ((expanded & 63) === 0 && performance.now() > deadline) break;
    if (qi >= layer.length) {
      if (!next.length || best) break;
      layer = next;
      next = [];
      qi = 0;
    }
    const node = layer[qi++];
    expanded++;

    // Walk the no-press path until the next landing, recording states.
    const trail: WorldState[] = [node.state];
    let s = node.state;
    let landed: WorldState | null = null;
    for (let i = 0; i < horizon; i++) {
      const r = step(level, s, false);
      s = r.state;
      trail.push(s);
      if (s.status !== 'playing') break;
      if (r.events.some((e) => e.type === 'pivot' || e.type === 'portal')) {
        landed = s;
        break;
      }
    }

    const consider = (st: WorldState, presses: number[], sameLayer: boolean) => {
      if (st.status === 'hit') return;
      if (done(st)) {
        if (!best || presses.length < best.moves || (presses.length === best.moves && st.tick < best.ticks)) {
          best = { presses, moves: presses.length, ticks: st.tick, sparks: st.sparks.length };
        }
        return;
      }
      if (st.status !== 'playing') return;
      const k = keyOf(st, dynamic);
      const prev = seen.get(k);
      if (prev !== undefined && prev <= presses.length) return;
      seen.set(k, presses.length);
      (sameLayer ? layer : next).push({ state: st, presses });
    };

    const final = trail[trail.length - 1];
    if (landed) consider(landed, node.presses, true);
    else if (final.status === 'won') consider(final, node.presses, true);

    // Branch: press at sampled points before the landing (or before a hit).
    const limit = trail.length - 1;
    for (let d = 0; d < limit; d += sample) {
      const base = trail[d];
      if (base.status !== 'playing') break;
      const pressTick = base.tick;
      const first = step(level, base, true);
      let st = first.state;
      let landing: WorldState | null = first.events.some((e) => e.type === 'pivot') ? st : null;
      for (let i = 0; !landing && i < horizon && st.status === 'playing'; i++) {
        const r = step(level, st, false);
        st = r.state;
        if (r.events.some((e) => e.type === 'pivot' || e.type === 'portal')) {
          landing = st;
          break;
        }
      }
      if (landing) consider(landing, [...node.presses, pressTick], false);
      else if (st.status === 'won') consider(st, [...node.presses, pressTick], false);
    }
  }
  return best;
}
