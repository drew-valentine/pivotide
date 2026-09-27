// Level loading: validate JSON and compile it into a form the sim can step fast.

import { TURN, turnsPerSecToUnits } from './fixed';
import { compilePath, pathMaxSpeed, pathPos, type CompiledPath } from './paths';
import {
  ROD_RADIUS,
  TICKS_PER_SEC,
  type HazardDef,
  type LevelDef,
  type PegDef,
  type PegKind,
  type WorldState,
} from './types';

export const SPEED_MULT: Record<PegKind, number> = {
  normal: 1, goal: 1, fast: 1.6, slow: 0.55, reverse: 1, once: 1, portal: 1,
};

export interface CompiledPeg {
  def: PegDef;
  kind: PegKind;
  path: CompiledPath | null;
  /** Portal partner index or -1. */
  pair: number;
  /** Rotation speed (turn units per tick) while pivoting here. */
  speed: number;
}

export interface CompiledHazard {
  def: HazardDef;
  r: number;
  path: CompiledPath | null;
}

export interface CompiledLevel {
  def: LevelDef;
  rod: number;
  snap: number;
  pegs: CompiledPeg[];
  hazards: CompiledHazard[];
  /** Substeps per tick, chosen so nothing moves more than half the thinnest gap per substep. */
  substeps: number;
  goal: number;
}

export class LevelError extends Error {}

const DEFAULT_ROD = 100;
const DEFAULT_SPEED = 0.42;
const DEFAULT_SNAP = 14;

export function compileLevel(def: LevelDef): CompiledLevel {
  const rod = def.rod ?? DEFAULT_ROD;
  const snap = def.snap ?? DEFAULT_SNAP;
  const base = turnsPerSecToUnits(def.speed ?? DEFAULT_SPEED, TICKS_PER_SEC);
  const ids = new Map<string, number>();
  def.pegs.forEach((p, i) => {
    if (ids.has(p.id)) throw new LevelError(`duplicate peg id "${p.id}"`);
    ids.set(p.id, i);
  });
  const pegs: CompiledPeg[] = def.pegs.map((p) => {
    const kind = p.kind ?? 'normal';
    let pair = -1;
    if (kind === 'portal') {
      const j = p.pair !== undefined ? ids.get(p.pair) : undefined;
      if (j === undefined) throw new LevelError(`portal "${p.id}" has no valid pair`);
      pair = j;
    }
    return {
      def: p,
      kind,
      path: p.path ? compilePath(p.path) : null,
      pair,
      speed: Math.round(base * SPEED_MULT[kind]),
    };
  });
  const start = ids.get(def.start.peg);
  if (start === undefined) throw new LevelError(`start peg "${def.start.peg}" not found`);
  const goal = pegs.findIndex((p) => p.kind === 'goal');
  if (goal < 0) throw new LevelError('level has no goal peg');

  const hazards: CompiledHazard[] = (def.hazards ?? []).map((h) => ({
    def: h,
    r: h.r ?? (h.kind === 'orb' ? 12 : h.kind === 'wall' ? 6 : 5),
    path: h.kind === 'orb' && h.path ? compilePath(h.path) : null,
  }));

  // Tunnelling guard: the fastest point in the scene must move less than half
  // of the thinnest (rod + hazard) radius per substep.
  const maxPegSpeed = Math.max(...pegs.map((p) => p.speed));
  let maxTravel = (rod * 2 * Math.PI * maxPegSpeed) / TURN;
  for (const p of pegs) if (p.path) maxTravel = Math.max(maxTravel, pathMaxSpeed(p.path) * 2);
  let minR = Infinity;
  for (const h of hazards) {
    minR = Math.min(minR, ROD_RADIUS + h.r);
    let travel = 0;
    if (h.path) travel = pathMaxSpeed(h.path);
    if (h.def.kind === 'blade') travel = (h.def.length / 2) * 2 * Math.PI * Math.abs(h.def.spin) / TICKS_PER_SEC;
    maxTravel = Math.max(maxTravel, travel);
  }
  const substeps = minR === Infinity ? 1 : Math.min(16, Math.max(1, Math.ceil(maxTravel / (minR * 0.5))));

  return { def, rod, snap, pegs, hazards, substeps, goal };
}

export function degToUnits(deg: number): number {
  return Math.round((deg / 360) * TURN);
}

export function initialState(level: CompiledLevel): WorldState {
  const pivot = level.pegs.findIndex((p) => p.def.id === level.def.start.peg);
  return {
    tick: 0,
    pivot,
    angle: degToUnits(level.def.start.angle),
    dir: level.def.start.dir,
    last: -1,
    armed: true,
    consumed: [],
    sparks: [],
    status: 'playing',
    hitHazard: -1,
  };
}

export function pegPos(level: CompiledLevel, i: number, tick: number, out: { x: number; y: number }): void {
  const p = level.pegs[i];
  if (p.path) pathPos(p.path, tick, out);
  else {
    out.x = p.def.x;
    out.y = p.def.y;
  }
}

export function cloneState(s: WorldState): WorldState {
  return { ...s, consumed: s.consumed.slice(), sparks: s.sparks.slice() };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Region the camera should frame: everything in the level plus one rod length
 * of swing room around the pegs.
 */
export function contentBounds(level: CompiledLevel): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number, pad: number) => {
    x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad);
  };
  const addPath = (p: CompiledPath | null, pad: number) => {
    if (!p) return;
    if (p.def.type === 'circle') add(p.def.cx, p.def.cy, p.def.r + pad);
    else for (const [x, y] of p.def.points) add(x, y, pad);
  };
  const swing = level.rod + 8;
  for (const p of level.pegs) {
    if (p.path) addPath(p.path, swing);
    else add(p.def.x, p.def.y, p.kind === 'goal' ? 30 : swing);
  }
  for (const h of level.hazards) {
    const d = h.def;
    if (d.kind === 'wall') { add(d.x1, d.y1, h.r); add(d.x2, d.y2, h.r); }
    else if (d.kind === 'orb') { if (h.path) addPath(h.path, h.r); else add(d.x, d.y, h.r); }
    else add(d.x, d.y, d.length / 2 + h.r);
  }
  for (const s of level.def.sparks ?? []) add(s.x, s.y, 12);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
