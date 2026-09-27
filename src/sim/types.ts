// Level JSON (authoring format) and runtime simulation types.

export const TICKS_PER_SEC = 120;
export const ROD_RADIUS = 3;
export const SPARK_RADIUS = 9;

export type PegKind = 'normal' | 'goal' | 'fast' | 'slow' | 'reverse' | 'once' | 'portal';

export type PathDef =
  | {
      type: 'polyline';
      /** Absolute world points. */
      points: [number, number][];
      /** Seconds for one full traversal (loop) or one there-and-back (pingpong). */
      period: number;
      mode?: 'loop' | 'pingpong';
      /** 0..1 offset into the cycle. */
      phase?: number;
    }
  | {
      type: 'circle';
      cx: number;
      cy: number;
      r: number;
      period: number;
      phase?: number;
      /** Counter-clockwise on screen. */
      ccw?: boolean;
    };

export interface PegDef {
  id: string;
  x: number;
  y: number;
  kind?: PegKind;
  /** Moving peg on a rail. */
  path?: PathDef;
  /** Portal partner id. */
  pair?: string;
}

export type HazardDef =
  | { id: string; kind: 'wall'; x1: number; y1: number; x2: number; y2: number; r?: number }
  | { id: string; kind: 'orb'; x: number; y: number; r?: number; path?: PathDef }
  | {
      id: string;
      kind: 'blade';
      x: number;
      y: number;
      /** Full length of the bar, centred on (x, y). */
      length: number;
      r?: number;
      /** Turns per second; negative spins counter-clockwise. */
      spin: number;
      phase?: number;
    };

export interface SparkDef {
  id: string;
  x: number;
  y: number;
}

export interface LevelDef {
  id: string;
  name: string;
  world: number;
  hint?: string;
  /** Rod length in world units (default 100). */
  rod?: number;
  /** Base rotation speed in turns per second (default 0.42). */
  speed?: number;
  /** Radial capture tolerance in world units (default 14). */
  snap?: number;
  start: { peg: string; angle: number; dir: 1 | -1 };
  bounds: { w: number; h: number };
  pegs: PegDef[];
  hazards?: HazardDef[];
  sparks?: SparkDef[];
  par: { time: number; moves: number };
  /**
   * Reference solution: ticks on which to press reverse. Replaying it must win.
   * Tests use it to prove every shipped level is solvable.
   */
  solution?: number[];
}

export type Status = 'playing' | 'hit' | 'won';

/** Complete, serialisable simulation state. Snapshots are plain copies of this. */
export interface WorldState {
  tick: number;
  pivot: number;
  /** Integer turn units, unbounded (not wrapped) so rendering can unwrap motion. */
  angle: number;
  dir: 1 | -1;
  /** Previous pivot index, or -1. */
  last: number;
  /** Whether the previous pivot can be captured again. */
  armed: boolean;
  /** Consumed one-use peg indices, ascending. */
  consumed: number[];
  /** Collected spark indices, ascending. */
  sparks: number[];
  status: Status;
  hitHazard: number;
}

export type SimEvent =
  | { type: 'reverse'; dir: 1 | -1 }
  | { type: 'pivot'; peg: number; from: number; dir: 1 | -1 }
  | { type: 'portal'; from: number; to: number }
  | { type: 'consume'; peg: number }
  | { type: 'spark'; spark: number }
  | { type: 'hit'; hazard: number }
  | { type: 'won'; peg: number };
