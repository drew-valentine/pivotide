import { describe, expect, it } from 'vitest';
import { compileLevel } from '../src/sim/level';
import { hashState, runReplay } from '../src/sim/replay';
import type { LevelDef } from '../src/sim/types';
import m1 from './fixtures/golden.json';

const level = compileLevel(m1 as LevelDef);
const presses = [40, 95, 180, 181, 260, 400, 555, 700, 702, 900];

describe('determinism', () => {
  it('the same inputs produce the same trace every run', () => {
    const a = runReplay(level, presses, 1500);
    const b = runReplay(level, presses, 1500);
    expect(a.trace).toBe(b.trace);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.events).toEqual(b.events);
  });

  it('resuming from a mid-run snapshot matches an uninterrupted run', () => {
    const full = runReplay(level, presses, 1200);
    const half = runReplay(level, presses, 600);
    const rest = runReplay(level, presses, 1200 - half.state.tick, half.state);
    expect(hashState(rest.state)).toBe(hashState(full.state));
  });

  it('different inputs diverge', () => {
    const a = runReplay(level, presses, 1500);
    const b = runReplay(level, [41, ...presses.slice(1)], 1500);
    expect(a.trace).not.toBe(b.trace);
  });

  it('matches the committed golden trace (update deliberately if sim rules change)', () => {
    const r = runReplay(level, presses, 1500);
    expect({ trace: r.trace, tick: r.state.tick, status: r.state.status }).toMatchSnapshot();
  });
});
