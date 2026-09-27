// Usage: npx tsx scripts/tune.ts levels/w1/01.json
// Tries start angles (every 30°) and both spin directions; reports what idling
// does and the fewest reversals for each, to help pick a start pose.
import { readFileSync } from 'node:fs';
import { compileLevel } from '../src/sim/level';
import { solve } from '../src/sim/solver';
import { runReplay } from '../src/sim/replay';
import { TICKS_PER_SEC, type LevelDef } from '../src/sim/types';

const file = process.argv[2];
const base = JSON.parse(readFileSync(file, 'utf8')) as LevelDef;
const rows: string[] = [];
for (const dir of [1, -1] as const) {
  for (let angle = 0; angle < 360; angle += 30) {
    const def = { ...base, start: { ...base.start, angle, dir } };
    const level = compileLevel(def);
    const idle = runReplay(level, [], 90 * TICKS_PER_SEC).state.status;
    const sol = solve(level, { maxNodes: 8000, timeLimitMs: 15000 });
    rows.push(`${dir === 1 ? 'cw ' : 'ccw'} ${String(angle).padStart(3)}°  idle=${idle.padEnd(7)} moves=${sol ? sol.moves : '—'} ${sol ? (sol.ticks / TICKS_PER_SEC).toFixed(1) + 's' : ''}`);
  }
}
console.log(rows.join('\n'));
