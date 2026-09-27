// Runs the solver off the main thread so the editor stays responsive.
import { compileLevel } from '../sim/level';
import { runReplay } from '../sim/replay';
import { solve } from '../sim/solver';
import { TICKS_PER_SEC, type LevelDef } from '../sim/types';

self.onmessage = (e: MessageEvent<LevelDef>) => {
  const level = compileLevel(e.data);
  const t0 = performance.now();
  const sol = solve(level, { maxNodes: 40000, timeLimitMs: 8000 });
  const sparks = level.def.sparks?.length ?? 0;
  const all = sparks ? solve(level, { maxNodes: 40000, allSparks: true, timeLimitMs: 8000 }) : null;
  const idle = runReplay(level, [], 60 * TICKS_PER_SEC).state.status;
  self.postMessage({ sol, all, sparks, idle, ms: Math.round(performance.now() - t0) });
};
