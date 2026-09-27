// Every shipped level must load, be solvable (its stored solution replays to a
// win), not be won by doing nothing, fit a phone in portrait, and keep its
// par values consistent with the reference solution.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileLevel, contentBounds } from '../src/sim/level';
import { runReplay } from '../src/sim/replay';
import { TICKS_PER_SEC, type LevelDef } from '../src/sim/types';
import index from '../levels/index.json';

const root = join(import.meta.dirname, '..', 'levels');
const keys = index.worlds.flatMap((w) => w.levels);

describe('level catalogue', () => {
  it('has 30 levels across 3 worlds', () => {
    expect(index.worlds).toHaveLength(3);
    expect(keys).toHaveLength(30);
  });

  it('every level file is listed exactly once', () => {
    const onDisk = ['w1', 'w2', 'w3'].flatMap((w) => readdirSync(join(root, w)).map((f) => `${w}/${f.replace('.json', '')}`));
    expect([...onDisk].sort()).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.each(keys)('level %s', (key) => {
  const def = JSON.parse(readFileSync(join(root, `${key}.json`), 'utf8')) as LevelDef;
  const level = compileLevel(def);

  it('has a stored solution that wins', () => {
    expect(def.solution).toBeDefined();
    const r = runReplay(level, def.solution!, 10 * 60 * TICKS_PER_SEC);
    expect(r.state.status).toBe('won');
  });

  it('is not won by doing nothing', () => {
    expect(runReplay(level, [], 90 * TICKS_PER_SEC).state.status).not.toBe('won');
  });

  it('par moves are reachable by the reference solution', () => {
    expect(def.par.moves).toBeGreaterThanOrEqual(def.solution!.length);
    const r = runReplay(level, def.solution!, 10 * 60 * TICKS_PER_SEC);
    expect(def.par.time).toBeGreaterThanOrEqual(Math.ceil(r.state.tick / TICKS_PER_SEC));
  });

  it('every spark can be collected (stored spark run)', () => {
    const n = def.sparks?.length ?? 0;
    if (!n) return;
    expect(def.sparkSolution).toBeDefined();
    const r = runReplay(level, def.sparkSolution!, 10 * 60 * TICKS_PER_SEC);
    expect(r.state.status).toBe('won');
    expect(r.state.sparks.length).toBe(n);
  });

  it('fits a phone in portrait', () => {
    const b = contentBounds(level);
    // Width in rod lengths: at most ~6.2 keeps the rod over 55px on a 360px-wide
    // phone (the renderer also enforces a minimum on-screen peg and rod size).
    expect(b.w / level.rod).toBeLessThanOrEqual(6.2);
    expect(b.h / b.w).toBeGreaterThanOrEqual(0.8);
  });

  it('id and world match its place in the catalogue', () => {
    const [w, n] = key.split('/');
    expect(def.id).toBe(`${w}-${n}`);
    expect(def.world).toBe(Number(w.slice(1)));
  });
});

describe('teaching levels', () => {
  it('the first three levels each have a one-line hint', () => {
    for (const key of keys.slice(0, 3)) {
      const def = JSON.parse(readFileSync(join(root, `${key}.json`), 'utf8')) as LevelDef;
      expect(def.hint).toBeTruthy();
      expect(def.hint!.length).toBeLessThanOrEqual(48);
      expect(def.hint).not.toContain('\n');
    }
  });
});
