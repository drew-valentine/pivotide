import { describe, expect, it } from 'vitest';
import { initialState, pegPos } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { step } from '../src/sim/step';
import type { PegKind, WorldState } from '../src/sim/types';
import { Session, UNDO_REWIND_MS } from '../src/game/session';
import { makeLevel } from './helpers';

function until(level: ReturnType<typeof makeLevel>, s: WorldState, pred: (s: WorldState) => boolean, max = 3000) {
  for (let i = 0; i < max && !pred(s) && s.status === 'playing'; i++) s = step(level, s, false).state;
  return s;
}

const pair = (kind: PegKind, extra = {}) =>
  makeLevel({
    pegs: [
      { id: 'a', x: 300, y: 300 },
      { id: 'b', x: 400, y: 300, kind, ...extra },
      { id: 'g', x: 20, y: 20, kind: 'goal' },
    ],
    start: { peg: 'a', angle: 270, dir: 1 },
  });

describe('special pegs', () => {
  it('fast and slow pegs change rotation speed while pivoting on them', () => {
    const base = pair('normal').pegs[0].speed;
    const fast = pair('fast');
    const slow = pair('slow');
    expect(fast.pegs[1].speed).toBeGreaterThan(base);
    expect(slow.pegs[1].speed).toBeLessThan(base);
    let s = until(fast, initialState(fast), (s) => s.pivot === 1);
    const a0 = s.angle;
    s = step(fast, s, false).state;
    expect(s.angle - a0).toBe(fast.pegs[1].speed);
  });

  it('reverse pegs flip direction on landing', () => {
    const lv = pair('reverse');
    const s = until(lv, initialState(lv), (s) => s.pivot === 1);
    expect(s.dir).toBe(-1);
  });

  it('one-use pegs vanish after the rod leaves them', () => {
    // a -> b(once) -> back to a; b must then be gone.
    const lv = pair('once');
    let s = until(lv, initialState(lv), (s) => s.pivot === 1);
    expect(s.consumed).toEqual([]);
    s = until(lv, s, (s) => s.pivot === 0);
    expect(s.consumed).toEqual([1]);
    // Swinging a full turn around a no longer captures b.
    for (let i = 0; i < 400; i++) s = step(lv, s, false).state;
    expect(s.pivot).toBe(0);
  });

  it('undo restores a consumed one-use peg', () => {
    const lv = pair('once');
    const sess = new Session(lv, () => {});
    let g = 0;
    while (sess.state.pivot !== 1 && g++ < 2000) sess.tick();
    g = 0;
    while (sess.state.pivot !== 0 && g++ < 2000) sess.tick();
    expect(sess.state.consumed).toEqual([1]);
    sess.undo();
    sess.frame(UNDO_REWIND_MS + 1);
    expect(sess.state.consumed).toEqual([]);
    expect(sess.state.pivot).toBe(1);
  });

  it('portals move the pivot to the partner and keep the rod angle', () => {
    const lv = makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'p1', x: 400, y: 300, kind: 'portal', pair: 'p2' },
        { id: 'p2', x: 500, y: 600, kind: 'portal', pair: 'p1' },
        { id: 'g', x: 20, y: 20, kind: 'goal' },
      ],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    const r = runReplay(lv, [], 200);
    const portal = r.events.find((e) => e.type === 'portal');
    expect(portal).toEqual({ type: 'portal', from: 1, to: 2 });
    expect(r.state.pivot).toBe(2);
  });

  it('moving pegs are captured at their current position and carry the rod', () => {
    // b rides a vertical rail through the rod's sweep.
    const lv = makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'b', x: 400, y: 250, path: { type: 'polyline', points: [[400, 250], [400, 350]], period: 3, mode: 'pingpong' } },
        { id: 'g', x: 20, y: 20, kind: 'goal' },
      ],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    let s = until(lv, initialState(lv), (s) => s.pivot === 1);
    expect(s.pivot).toBe(1);
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 0 };
    pegPos(lv, 1, s.tick, p0);
    s = until(lv, s, (st) => st.tick >= s.tick + 60);
    pegPos(lv, 1, s.tick, p1);
    expect(Math.abs(p1.y - p0.y)).toBeGreaterThan(1);
  });

  it('portal pairs must reference a valid partner', () => {
    expect(() =>
      makeLevel({ pegs: [{ id: 'a', x: 0, y: 0 }, { id: 'p', x: 100, y: 0, kind: 'portal', pair: 'nope' }, { id: 'g', x: 9, y: 9, kind: 'goal' }] }),
    ).toThrow(/pair/);
  });
});
