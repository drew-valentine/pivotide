import { describe, expect, it } from 'vitest';
import { compileLevel } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { solve } from '../src/sim/solver';
import type { LevelDef } from '../src/sim/types';
import m1 from '../levels/test/m1.json';
import { makeLevel } from './helpers';

describe('solver', () => {
  it('finds a zero-press solution when the goal is directly reachable', () => {
    const lv = makeLevel({
      pegs: [{ id: 'a', x: 300, y: 300 }, { id: 'g', x: 400, y: 300, kind: 'goal' }],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    expect(solve(lv)?.moves).toBe(0);
  });

  it('solutions replay to a win', () => {
    const lv = compileLevel(m1 as LevelDef);
    const sol = solve(lv);
    expect(sol).not.toBeNull();
    console.log('m1 solution', sol);
    const r = runReplay(lv, sol!.presses, sol!.ticks + 5);
    expect(r.state.status).toBe('won');
  });
});
