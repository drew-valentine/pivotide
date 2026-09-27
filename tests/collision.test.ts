import { describe, expect, it } from 'vitest';
import { initialState } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { step } from '../src/sim/step';
import { makeLevel } from './helpers';

const base = {
  pegs: [
    { id: 'a', x: 300, y: 300 },
    { id: 'g', x: 20, y: 20, kind: 'goal' as const },
  ],
  start: { peg: 'a', angle: 0, dir: 1 as const },
};

describe('hazard collision uses the whole rod', () => {
  it('a wall crossing the middle of the rod path is hit', () => {
    // Short wall at radius 40..60 below the pivot. The tip (r=100) never touches it; the rod body does.
    const lv = makeLevel({ ...base, hazards: [{ id: 'w', kind: 'wall', x1: 300, y1: 340, x2: 300, y2: 360, r: 4 }] });
    const r = runReplay(lv, [], 400);
    expect(r.state.status).toBe('hit');
    expect(r.events.find((e) => e.type === 'hit')).toEqual({ type: 'hit', hazard: 0 });
  });

  it('an orb near the pivot is hit by the rod body', () => {
    const lv = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 330, r: 8 }] });
    expect(runReplay(lv, [], 400).state.status).toBe('hit');
  });

  it('a hazard beyond the rod reach is never hit', () => {
    const lv = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 420, r: 8 }] });
    expect(runReplay(lv, [], 600).state.status).toBe('playing');
  });

  it('hazards just outside the rod + hazard radius are safe (clearance)', () => {
    // Orb centre 111.5 from pivot, r=8, rod radius 3: tip at 100, gap 0.5.
    const lv = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 411.5, r: 8 }] });
    expect(runReplay(lv, [], 600).state.status).toBe('playing');
    const lv2 = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 410.5, r: 8 }] });
    expect(runReplay(lv2, [], 600).state.status).toBe('hit');
  });

  it('a moving orb that drifts into a stationary-ish rod is hit', () => {
    const lv = makeLevel({
      ...base,
      speed: 0.01,
      hazards: [{ id: 'o', kind: 'orb', x: 450, y: 300, r: 8, path: { type: 'polyline', points: [[450, 300], [350, 300]], period: 2, mode: 'pingpong' } }],
    });
    expect(runReplay(lv, [], 240).state.status).toBe('hit');
  });

  it('a rotating blade sweeps into the rod', () => {
    const lv = makeLevel({
      ...base,
      speed: 0.01,
      start: { peg: 'a', angle: 0, dir: 1 },
      hazards: [{ id: 'b', kind: 'blade', x: 360, y: 340, length: 70, spin: 0.5, phase: 0 }],
    });
    expect(runReplay(lv, [], 240).state.status).toBe('hit');
  });

  it('no tunnelling through a thin wall at high speed (substeps)', () => {
    const lv = makeLevel({ ...base, speed: 3, hazards: [{ id: 'w', kind: 'wall', x1: 350, y1: 310, x2: 390, y2: 310, r: 1 }] });
    expect(lv.substeps).toBeGreaterThan(1);
    expect(runReplay(lv, [], 120).state.status).toBe('hit');
  });

  it('a hit freezes the sim', () => {
    const lv = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 330, r: 8 }] });
    const r = runReplay(lv, [], 400);
    expect(step(lv, r.state, false).state).toEqual(r.state);
  });

  it('initial state is untouched by hazards until the first step', () => {
    const lv = makeLevel({ ...base, hazards: [{ id: 'o', kind: 'orb', x: 300, y: 330, r: 8 }] });
    expect(initialState(lv).status).toBe('playing');
  });
});
