import { describe, expect, it } from 'vitest';
import { compileLevel } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { solve } from '../src/sim/solver';
import type { LevelDef } from '../src/sim/types';
import m1 from './fixtures/m1.json';
import { makeLevel } from './helpers';

describe('solver', () => {
  it('finds a zero-press solution when the goal is directly reachable', () => {
    const lv = makeLevel({
      pegs: [{ id: 'a', x: 300, y: 300 }, { id: 'g', x: 400, y: 300, kind: 'goal' }],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    expect(solve(lv)?.moves).toBe(0);
  });

  it('finds a one-press solution when idling hits a wall', () => {
    const r = (d: number) => (d * Math.PI) / 180;
    const lv = makeLevel({
      pegs: [
        { id: 'a', x: 300, y: 300 },
        { id: 'b', x: 400, y: 300 },
        { id: 'g', x: 300 + 100 * Math.cos(r(200)), y: 300 + 100 * Math.sin(r(200)), kind: 'goal' },
      ],
      hazards: [{ id: 'w', kind: 'wall', x1: 400, y1: 240, x2: 400, y2: 260, r: 4 }],
      start: { peg: 'a', angle: 270, dir: 1 },
    });
    expect(runReplay(lv, [], 2000).state.status).toBe('hit');
    const sol = solve(lv);
    expect(sol?.moves).toBe(1);
    expect(runReplay(lv, sol!.presses, sol!.ticks + 5).state.status).toBe('won');
  });

  it('solves the test level and its solution replays to a win', () => {
    const lv = compileLevel(m1 as LevelDef);
    const sol = solve(lv, { maxNodes: 20000 });
    if (sol) expect(runReplay(lv, sol.presses, sol.ticks + 5).state.status).toBe('won');
  });
});
