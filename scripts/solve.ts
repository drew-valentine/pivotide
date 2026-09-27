// Usage: npx tsx scripts/solve.ts levels/w1/01.json [--sparks]
// Prints the minimum-press solution and suggested par values.
import { readFileSync } from 'node:fs';
import { compileLevel } from '../src/sim/level';
import { solve } from '../src/sim/solver';
import { runReplay } from '../src/sim/replay';
import { TICKS_PER_SEC, type LevelDef } from '../src/sim/types';

for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const def = JSON.parse(readFileSync(file, 'utf8')) as LevelDef;
  const level = compileLevel(def);
  const t0 = performance.now();
  const sol = solve(level, { allSparks: process.argv.includes('--sparks'), maxNodes: 20000 });
  const ms = (performance.now() - t0).toFixed(0);
  if (!sol) {
    console.log(`${file}: UNSOLVED (${ms}ms)`);
    continue;
  }
  const idle = runReplay(level, [], 60 * TICKS_PER_SEC);
  const secs = sol.ticks / TICKS_PER_SEC;
  console.log(
    `${file}: moves=${sol.moves} time=${secs.toFixed(1)}s presses=[${sol.presses.join(',')}] ` +
    `idle=${idle.state.status} (${ms}ms, substeps=${level.substeps})`,
  );
}
