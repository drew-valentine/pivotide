import { describe, expect, it } from 'vitest';
import { TURN } from '../src/sim/fixed';
import { initialState, cloneState } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { step } from '../src/sim/step';
import type { WorldState } from '../src/sim/types';
import { makeLevel } from './helpers';

function runUntil(level: ReturnType<typeof makeLevel>, s: WorldState, pred: (s: WorldState) => boolean, max = 2000, presses: number[] = []) {
  for (let i = 0; i < max; i++) {
    if (pred(s)) return s;
    s = step(level, s, presses.includes(s.tick)).state;
  }
  return s;
}

describe('pivot transfer', () => {
  // A at origin pointing up; B to the right. Clockwise (dir 1) sweeps up → right.
  const level = makeLevel({
    pegs: [
      { id: 'a', x: 300, y: 300 },
      { id: 'b', x: 400, y: 300 },
      { id: 'g', x: 100, y: 100, kind: 'goal' },
    ],
    start: { peg: 'a', angle: 270, dir: 1 },
  });

  it('transfers to a peg when the free end sweeps over it', () => {
    const s = runUntil(level, initialState(level), (s) => s.pivot !== 0);
    expect(s.pivot).toBe(1);
    // A quarter turn at the level's speed takes ~71 ticks.
    expect(s.tick).toBeGreaterThan(65);
    expect(s.tick).toBeLessThan(78);
  });

  it('keeps rotating in the same direction around the new pivot, pointing back at the old one', () => {
    let s = runUntil(level, initialState(level), (s) => s.pivot === 1);
    expect(s.dir).toBe(1);
    // Right after transfer the rod points (roughly) from B back to A: 180 degrees.
    const deg = (((s.angle % TURN) + TURN) % TURN) / TURN * 360;
    expect(Math.abs(deg - 180)).toBeLessThan(3);
    const before = s.angle;
    s = step(level, s, false).state;
    expect(s.angle).toBeGreaterThan(before);
  });

  it('a quick reversal after landing passes over the old pivot (turn-around tap)', () => {
    let s = runUntil(level, initialState(level), (s) => s.pivot === 1);
    expect(s.armed).toBe(false);
    s = step(level, s, true).state; // reverse immediately
    for (let i = 0; i < 40; i++) s = step(level, s, false).state;
    expect(s.pivot).toBe(1);
  });

  it('the old pivot re-arms after about a tenth of a turn', () => {
    let s = runUntil(level, initialState(level), (s) => s.pivot === 1);
    for (let i = 0; i < 20; i++) s = step(level, s, false).state;
    expect(s.armed).toBe(false);
    for (let i = 0; i < 20; i++) s = step(level, s, false).state;
    expect(s.armed).toBe(true);
  });

  it('reversing after leaving the old pivot swings back onto it', () => {
    let s = runUntil(level, initialState(level), (s) => s.pivot === 1);
    // Swing about 50 degrees away, then reverse.
    for (let i = 0; i < 40; i++) s = step(level, s, false).state;
    expect(s.armed).toBe(true);
    s = step(level, s, true).state;
    s = runUntil(level, s, (s) => s.pivot !== 1, 200);
    expect(s.pivot).toBe(0);
  });

  it('reverse flips direction', () => {
    const s0 = initialState(level);
    const s1 = step(level, s0, true).state;
    expect(s1.dir).toBe(-1);
    expect(s1.angle).toBeLessThan(s0.angle);
  });

  it('picks the peg crossed earliest in the sweep', () => {
    // From angle 0 clockwise: C at 20 degrees comes before B at 40 degrees.
    const rad = (d: number) => (d * Math.PI) / 180;
    const lv = makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'b', x: 300 + 100 * Math.cos(rad(40)), y: 300 + 100 * Math.sin(rad(40)) },
        { id: 'c', x: 300 + 100 * Math.cos(rad(20)), y: 300 + 100 * Math.sin(rad(20)) },
        { id: 'g', x: 50, y: 50, kind: 'goal' },
      ],
      start: { peg: 'a', angle: 0, dir: 1 },
      speed: 10, // very fast: both pegs fall inside a single tick's sweep
    });
    const s = runUntil(lv, initialState(lv), (s) => s.pivot !== 0, 10);
    expect(s.pivot).toBe(2);
  });

  it('reaching the goal wins and stops the sim', () => {
    const lv = makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'g', x: 400, y: 300, kind: 'goal' },
      ],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    const r = runReplay(lv, [], 500);
    expect(r.state.status).toBe('won');
    expect(r.events.some((e) => e.type === 'won')).toBe(true);
    const frozen = step(lv, r.state, true).state;
    expect(frozen).toEqual(r.state);
  });

  it('step does not mutate its input', () => {
    const s0 = initialState(level);
    const copy = cloneState(s0);
    step(level, s0, true);
    expect(s0).toEqual(copy);
  });

  it('speed is constant through a transfer (leftover rotation carries over)', () => {
    // Total angle swept per tick stays ~equal to the base speed even on the transfer tick.
    let s = initialState(level);
    const v = level.pegs[0].speed;
    let prev = s;
    for (let i = 0; i < 120; i++) {
      s = step(level, prev, false).state;
      if (s.pivot !== prev.pivot) {
        // After transfer the rod sits a little past 180 degrees from B's view.
        const past = s.angle - Math.round(TURN / 2);
        expect(past).toBeGreaterThanOrEqual(-2);
        expect(past).toBeLessThanOrEqual(v + 2);
      }
      prev = s;
    }
  });
});

describe('snap radius', () => {
  const mk = (dist: number) =>
    makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'b', x: 300 + dist, y: 300 },
        { id: 'g', x: 50, y: 50, kind: 'goal' },
      ],
      start: { peg: 'a', angle: 270, dir: 1 },
      snap: 14,
    });
  const captures = (dist: number) => runReplay(mk(dist), [], 400).events.some((e) => e.type === 'pivot');

  it('captures pegs exactly at rod length', () => expect(captures(100)).toBe(true));
  it('captures pegs just inside the snap band (long)', () => expect(captures(113.5)).toBe(true));
  it('captures pegs just inside the snap band (short)', () => expect(captures(86.5)).toBe(true));
  it('ignores pegs just outside the snap band (long)', () => expect(captures(114.5)).toBe(false));
  it('ignores pegs just outside the snap band (short)', () => expect(captures(85.5)).toBe(false));
  it('ignores pegs far inside the rod', () => expect(captures(40)).toBe(false));
});
