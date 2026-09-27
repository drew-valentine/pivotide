// Usage: npx tsx scripts/solve.ts levels/w1/*.json [--write] [--nodes=N]
// Finds the minimum-reversal solution for each level and reports design checks.
// With --write, stores the solution and relaxed par values back into the file.
import { readFileSync, writeFileSync } from 'node:fs';
import { compileLevel, contentBounds } from '../src/sim/level';
import { solve } from '../src/sim/solver';
import { runReplay } from '../src/sim/replay';
import { TICKS_PER_SEC, type LevelDef } from '../src/sim/types';

const args = process.argv.slice(2);
const write = args.includes('--write');
const nodes = Number(args.find((a) => a.startsWith('--nodes='))?.split('=')[1] ?? 30000);

for (const file of args.filter((a) => !a.startsWith('--'))) {
  const def = JSON.parse(readFileSync(file, 'utf8')) as LevelDef;
  const level = compileLevel(def);
  const t0 = performance.now();
  const sol = solve(level, { maxNodes: nodes, timeLimitMs: 120000 });
  const nSparks = def.sparks?.length ?? 0;
  const all = nSparks ? solve(level, { maxNodes: nodes, allSparks: true, timeLimitMs: 120000 }) : null;
  const ms = (performance.now() - t0).toFixed(0);
  const idle = runReplay(level, [], 90 * TICKS_PER_SEC).state.status;
  const b = contentBounds(level);
  const aspect = (b.h / b.w).toFixed(2);
  if (!sol) {
    const reached = new Set<string>();
    solve(level, { maxNodes: nodes, timeLimitMs: 30000, onVisit: (st) => reached.add(level.pegs[st.pivot].def.id) });
    const missing = level.pegs.map((p) => p.def.id).filter((id) => !reached.has(id));
    console.log(`✗ ${file}: UNSOLVED idle=${idle} aspect=${aspect} (${ms}ms)\n   reached: ${[...reached].join(' ')}\n   never:   ${missing.join(' ')}`);
    continue;
  }
  const secs = sol.ticks / TICKS_PER_SEC;
  const par = { time: Math.ceil(secs * 1.5 + 4), moves: sol.moves + (sol.moves >= 3 ? 1 : 0) };
  console.log(
    `${idle === 'won' ? '!' : '✓'} ${file}: moves=${sol.moves} time=${secs.toFixed(1)}s ` +
    `sparks=${nSparks ? (all ? `${all.moves}mv/${(all.ticks / TICKS_PER_SEC).toFixed(1)}s` : 'UNREACHABLE') : '-'} ` +
    `idle=${idle} aspect=${aspect} size=${b.w.toFixed(0)}x${b.h.toFixed(0)} substeps=${level.substeps} (${ms}ms)`,
  );
  if (args.includes('--trace')) {
    const route = (presses: number[]) =>
      runReplay(level, presses, 90 * TICKS_PER_SEC).events
        .filter((e) => e.type === 'pivot' || e.type === 'reverse' || e.type === 'hit')
        .slice(0, 30)
        .map((e) => (e.type === 'pivot' ? level.pegs[e.peg].def.id : e.type === 'hit' ? 'HIT' : '↺'))
        .join(' ');
    console.log(`   idle:     ${route([])}`);
    console.log(`   solution: ${route(sol.presses)}  presses=[${sol.presses}]`);
  }
  if (write) {
    def.par = par;
    def.solution = sol.presses;
    if (all) def.sparkSolution = all.presses;
    writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
  }
}
