// Fixed-timestep loop with interpolated rendering. The sim always advances in
// whole ticks of 1/120 s; rendering blends the last two states by `alpha`.

import { TICKS_PER_SEC } from '../sim/types';

const STEP_MS = 1000 / TICKS_PER_SEC;
const MAX_FRAME_MS = 250;

export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  paused = false;

  constructor(
    private onTick: () => void,
    private onFrame: (alpha: number, frameMs: number) => void,
  ) {}

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(MAX_FRAME_MS, now - this.last);
      this.last = now;
      if (!this.paused) {
        this.acc += dt;
        while (this.acc >= STEP_MS) {
          this.onTick();
          this.acc -= STEP_MS;
        }
      }
      this.onFrame(this.paused ? 1 : this.acc / STEP_MS, dt);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Drop accumulated time (after a pause or level switch) so nothing jumps. */
  resetClock(): void {
    this.acc = 0;
    this.last = performance.now();
  }
}
