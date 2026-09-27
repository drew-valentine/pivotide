// A play session for one level: owns the sim state, queues input, keeps the
// pivot history for rewind and undo, and produces interpolated views.

import { cloneState, initialState, type CompiledLevel } from '../sim/level';
import { step } from '../sim/step';
import type { SimEvent, WorldState } from '../sim/types';

export interface View {
  pivot: number;
  /** Interpolated angle in turn units (float). */
  angle: number;
  /** Interpolated time in ticks (float). */
  t: number;
  state: WorldState;
  mode: Mode;
  /** 0..1 progress through a rewind animation. */
  rewind: number;
  /** 0..1 progress through the post-rewind pause (1 when not pausing). */
  breath: number;
}

export type Mode = 'playing' | 'rewind' | 'breath' | 'won';

export type SessionEvent =
  | SimEvent
  | { type: 'rewind-start'; cause: 'hit' | 'undo' }
  | { type: 'rewind-end' }
  | { type: 'resume' };

export type EventSink = (e: SessionEvent, s: WorldState) => void;

export const HIT_REWIND_MS = 500;
export const UNDO_REWIND_MS = 420;
export const BREATH_MS = 400;
/** Longest tape kept for rewind playback (ticks). */
const TAPE_LIMIT = 120 * 90;

export interface Stars {
  total: number;
  time: boolean;
  moves: boolean;
}

export function starsFor(level: CompiledLevel, elapsedMs: number, moves: number): Stars {
  const time = elapsedMs <= level.def.par.time * 1000;
  const mv = moves <= level.def.par.moves;
  return { total: 1 + (time ? 1 : 0) + (mv ? 1 : 0), time, moves: mv };
}

export class Session {
  state: WorldState;
  prev: WorldState;
  mode: Mode = 'playing';
  moves = 0;
  rewinds = 0;
  /** Real play time in ms (runs while unpaused, until the level is won). */
  elapsedMs = 0;
  /** Scripted presses by tick (demo playback and debugging). */
  script: Set<number> | null = null;

  private queued = 0;
  /** Landing snapshots; [0] is the level start. */
  private history: WorldState[];
  /** Every tick's state since the landing before the current one. */
  private tape: WorldState[];
  private rewindFrom = 0;
  private rewindTo = 0;
  private rewindMs = 0;
  private rewindDur = HIT_REWIND_MS;
  private rewindTarget: WorldState | null = null;
  private breathMs = 0;
  private breathDur = BREATH_MS;
  /** True during the intro hold; the clock does not run yet. */
  private holding = false;
  /** A press during a rewind flips direction when play resumes. */
  private pendingFlip = false;

  constructor(readonly level: CompiledLevel, private sink: EventSink, opts: { startDelayMs?: number } = {}) {
    this.state = initialState(level);
    this.prev = this.state;
    this.history = [this.state];
    this.tape = [this.state];
    if (opts.startDelayMs) {
      // Hold still while the level fades in; a tap during the hold sets the direction.
      this.mode = 'breath';
      this.breathDur = opts.startDelayMs;
      this.holding = true;
    }
  }

  /** Player pressed reverse. Applied on the next fixed tick. */
  press(): void {
    if (this.mode === 'won') return;
    this.moves++;
    if (this.mode === 'playing') this.queued++;
    else if (this.mode === 'breath') {
      this.state = { ...this.state, dir: this.state.dir === 1 ? -1 : 1 };
      this.prev = this.state;
      this.sink({ type: 'reverse', dir: this.state.dir }, this.state);
    } else this.pendingFlip = !this.pendingFlip;
  }

  /** Rewind one pivot: back to the moment the rod landed on the previous peg. */
  undo(): void {
    if (this.mode === 'won' || this.mode === 'rewind') return;
    if (this.history.length > 1) this.history.pop();
    this.beginRewind(this.history[this.history.length - 1], UNDO_REWIND_MS, 'undo');
  }

  tick(): void {
    this.prev = this.state;
    if (this.mode !== 'playing') return;
    let reverse = this.queued > 0;
    if (reverse) this.queued--;
    if (this.script?.has(this.state.tick)) reverse = !reverse;
    const r = step(this.level, this.state, reverse);
    this.state = r.state;
    this.tape.push(this.state);
    for (const e of r.events) {
      if (e.type === 'pivot' || e.type === 'portal') this.onLanding();
      this.sink(e, this.state);
    }
    if (this.state.status === 'hit') {
      this.rewinds++;
      this.beginRewind(this.history[this.history.length - 1], HIT_REWIND_MS, 'hit');
    } else if (this.state.status === 'won') {
      this.mode = 'won';
    }
  }

  private onLanding(): void {
    // Only record once per tick even if the tick had several transfers.
    if (this.history[this.history.length - 1].tick === this.state.tick) this.history.pop();
    this.history.push(this.state);
    // Keep a few landings of tape so repeated undos can still play back smoothly.
    const keepFrom = this.history[Math.max(0, this.history.length - 4)].tick;
    const idx = this.tape.findIndex((s) => s.tick >= keepFrom);
    if (idx > 0) this.tape.splice(0, idx);
    if (this.tape.length > TAPE_LIMIT) this.tape.splice(0, this.tape.length - TAPE_LIMIT);
  }

  private beginRewind(target: WorldState, durMs: number, cause: 'hit' | 'undo'): void {
    this.queued = 0;
    this.pendingFlip = false;
    this.rewindTarget = target;
    this.rewindDur = durMs;
    this.rewindMs = 0;
    this.rewindFrom = this.tape.length - 1;
    let to = this.tape.findIndex((s) => s.tick >= target.tick);
    if (to < 0) to = 0;
    this.rewindTo = to;
    this.mode = 'rewind';
    this.sink({ type: 'rewind-start', cause }, this.state);
  }

  /** Advance real-time animations (rewind, breath). Call once per frame. */
  frame(ms: number): void {
    if (this.mode !== 'won' && !this.holding) this.elapsedMs += ms;
    if (this.mode === 'rewind') {
      this.rewindMs += ms;
      if (this.rewindMs >= this.rewindDur) this.endRewind();
    } else if (this.mode === 'breath') {
      this.breathMs += ms;
      if (this.breathMs >= this.breathDur) {
        this.mode = 'playing';
        this.holding = false;
        this.sink({ type: 'resume' }, this.state);
      }
    }
  }

  private endRewind(): void {
    const target = cloneState(this.rewindTarget ?? this.history[0]);
    if (this.pendingFlip) target.dir = target.dir === 1 ? -1 : 1;
    this.pendingFlip = false;
    this.state = target;
    this.prev = target;
    const idx = this.tape.findIndex((s) => s.tick > target.tick);
    if (idx >= 0) this.tape.length = idx;
    this.tape[this.tape.length - 1] = target;
    this.mode = 'breath';
    this.breathMs = 0;
    this.breathDur = BREATH_MS;
    this.sink({ type: 'rewind-end' }, this.state);
  }

  /** Remaining time in the current breath pause, 0..1 (for the UI ring). */
  breathProgress(): number {
    return this.mode === 'breath' ? Math.min(1, this.breathMs / this.breathDur) : 1;
  }

  canUndo(): boolean {
    return this.mode !== 'won' && this.mode !== 'rewind' && (this.history.length > 1 || this.state.tick > 0);
  }

  view(alpha: number): View {
    if (this.mode === 'rewind') {
      const k = Math.min(1, this.rewindMs / this.rewindDur);
      // Ease in-out so the tape starts and settles gently.
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const f = this.rewindFrom + (this.rewindTo - this.rewindFrom) * e;
      const i = Math.floor(f);
      const a = this.tape[Math.max(0, Math.min(this.tape.length - 1, i))];
      const b = this.tape[Math.max(0, Math.min(this.tape.length - 1, i + 1))];
      const frac = f - i;
      if (a.pivot === b.pivot) {
        return {
          pivot: a.pivot, angle: a.angle + (b.angle - a.angle) * frac, t: a.tick + (b.tick - a.tick) * frac,
          state: a, mode: this.mode, rewind: k, breath: 1,
        };
      }
      return { pivot: a.pivot, angle: a.angle, t: a.tick, state: a, mode: this.mode, rewind: k, breath: 1 };
    }
    const a = this.prev;
    const b = this.state;
    if (a.pivot !== b.pivot || a === b || this.mode !== 'playing') {
      return { pivot: b.pivot, angle: b.angle, t: b.tick, state: b, mode: this.mode, rewind: 0, breath: this.breathProgress() };
    }
    return {
      pivot: b.pivot,
      angle: a.angle + (b.angle - a.angle) * alpha,
      t: a.tick + (b.tick - a.tick) * alpha,
      state: b,
      mode: this.mode,
      rewind: 0,
      breath: 1,
    };
  }
}
