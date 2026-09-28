// Level catalogue: the shipped JSON levels in play order, grouped by world.

import type { LevelDef } from '../sim/types';
import index from '../../levels/index.json';

const files = import.meta.glob<LevelDef>('../../levels/w*/*.json', { eager: true, import: 'default' });

export interface WorldInfo {
  id: number;
  name: string;
  blurb: string;
  levels: LevelEntry[];
}

export interface LevelEntry {
  key: string;
  def: LevelDef;
  world: number;
  /** 0-based index within the world. */
  index: number;
  /** 0-based index across the whole game. */
  global: number;
}

let global = 0;
export const WORLDS: WorldInfo[] = index.worlds.map((w) => ({
  id: w.id,
  name: w.name,
  blurb: w.blurb,
  levels: w.levels.map((key, i) => {
    const def = files[`../../levels/${key}.json`];
    if (!def) throw new Error(`Missing level file levels/${key}.json`);
    return { key, def, world: w.id, index: i, global: global++ };
  }),
}));

export const ALL_LEVELS: LevelEntry[] = WORLDS.flatMap((w) => w.levels);

export function findLevel(key: string): LevelEntry | undefined {
  return ALL_LEVELS.find((l) => l.key === key);
}

/** 0..1 progress through the entry's world, used to move the sun or moon level by level. */
export function duskFor(entry: LevelEntry): number {
  const n = WORLDS[entry.world - 1]?.levels.length ?? 1;
  return n > 1 ? entry.index / (n - 1) : 0;
}
