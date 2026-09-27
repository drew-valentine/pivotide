// Replays: a run is fully described by the ticks on which the player pressed
// reverse. Used for determinism tests and (later) ghost runs.

import { initialState, type CompiledLevel } from './level';
import { step } from './step';
import type { SimEvent, WorldState } from './types';

/** FNV-1a over the JSON form of the state. */
export function hashState(s: WorldState): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface ReplayResult {
  state: WorldState;
  events: SimEvent[];
  /** Hash of every tick's state folded together, which catches divergence anywhere in the run. */
  trace: string;
}

export function runReplay(level: CompiledLevel, presses: number[], maxTicks: number, from?: WorldState): ReplayResult {
  let state = from ?? initialState(level);
  const pressSet = new Set(presses);
  const events: SimEvent[] = [];
  let trace = '';
  for (let t = 0; t < maxTicks && state.status === 'playing'; t++) {
    const r = step(level, state, pressSet.has(state.tick));
    state = r.state;
    events.push(...r.events);
    trace = hashState({ ...state, status: `${state.status}:${trace}` as WorldState['status'] });
  }
  return { state, events, trace };
}
