import { compileLevel } from '../src/sim/level';
import type { LevelDef } from '../src/sim/types';

export function makeLevel(partial: Partial<LevelDef> & Pick<LevelDef, 'pegs'>): ReturnType<typeof compileLevel> {
  return compileLevel({
    id: 'test',
    name: 'Test',
    world: 1,
    start: { peg: partial.pegs[0].id, angle: 0, dir: 1 },
    bounds: { w: 600, h: 600 },
    par: { time: 30, moves: 5 },
    ...partial,
  });
}
