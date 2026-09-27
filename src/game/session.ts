// A play session for one level: owns the sim state, queues input, and
// produces interpolated views for the renderer.

import { initialState, type CompiledLevel } from '../sim/level';
import { step } from '../sim/step';
import type { SimEvent, WorldState } from '../sim/types';

export interface View {
  pivot: number;
  /** Interpolated angle in turn units (float). */
  angle: number;
  /** Interpolated time in ticks (float). */
  t: number;
  state: WorldState;
}

export type EventSink = (e: SimEvent, s: WorldState) => void;

export class Session {
  state: WorldState;
  prev: WorldState;
  private queued = 0;
  moves = 0;
  /** Real play time in ms (runs while unpaused, until the level is won). */
  elapsedMs = 0;
  /** Scripted presses by tick (demo playback and debugging). */
  script: Set<number> | null = null;

  constructor(readonly level: CompiledLevel, private sink: EventSink) {
    this.state = initialState(level);
    this.prev = this.state;
  }

  /** Player pressed reverse. Applied on the next fixed tick. */
  press(): void {
    if (this.state.status !== 'playing') return;
    this.queued++;
    this.moves++;
  }

  tick(): void {
    this.prev = this.state;
    if (this.state.status !== 'playing') return;
    let reverse = this.queued > 0;
    if (reverse) this.queued--;
    if (this.script?.has(this.state.tick)) reverse = !reverse;
    const r = step(this.level, this.state, reverse);
    this.state = r.state;
    for (const e of r.events) this.sink(e, this.state);
  }

  addTime(ms: number): void {
    if (this.state.status === 'playing') this.elapsedMs += ms;
  }

  view(alpha: number): View {
    const a = this.prev;
    const b = this.state;
    if (a.pivot !== b.pivot || a === b) {
      return { pivot: b.pivot, angle: b.angle, t: b.tick, state: b };
    }
    return {
      pivot: b.pivot,
      angle: a.angle + (b.angle - a.angle) * alpha,
      t: a.tick + (b.tick - a.tick) * alpha,
      state: b,
    };
  }
}
