// Design assistant for hand-authored level skeletons.
//
// Usage: npx tsx scripts/design.ts <template.json> <out.json> <minMoves> <maxMoves> [--tries=N]
//
// A template is a normal level whose pegs/hazards/sparks may carry "opt": true,
// and which may list "starts": [{peg, angle, dir}, ...]. The script tries
// subsets of the optional pieces and the candidate start poses, keeps variants
// where idling does not win and the fewest-reversal solution falls inside the
// target range (with every spark reachable), and writes the best one with its
// reference solutions and relaxed par values.
import { readFileSync, writeFileSync } from 'node:fs';
import { compileLevel } from '../src/sim/level';
import { solve } from '../src/sim/solver';
import { runReplay } from '../src/sim/replay';
import { TICKS_PER_SEC, type LevelDef } from '../src/sim/types';

type Opt<T> = T & { opt?: boolean };
interface Template extends LevelDef {
  starts?: LevelDef['start'][];
}

const [tplPath, outPath, minS, maxS] = process.argv.slice(2);
const tries = Number(process.argv.find((a) => a.startsWith('--tries='))?.split('=')[1] ?? 240);
const limit = Number(process.argv.find((a) => a.startsWith('--time='))?.split('=')[1] ?? 4000);
const wallCost = Number(process.argv.find((a) => a.startsWith('--wallcost='))?.split('=')[1] ?? 0.6);
const minMoves = Number(minS), maxMoves = Number(maxS);
const tpl = JSON.parse(readFileSync(tplPath, 'utf8')) as Template;

const optional: { list: 'pegs' | 'hazards' | 'sparks'; index: number }[] = [];
for (const list of ['pegs', 'hazards', 'sparks'] as const) {
  (tpl[list] ?? []).forEach((e: Opt<object>, index: number) => { if (e.opt) optional.push({ list, index }); });
}
const starts = tpl.starts?.length ? tpl.starts : [tpl.start];

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function variant(mask: number, start: LevelDef['start']): LevelDef {
  const drop = new Set(optional.filter((_, k) => !(mask & (1 << k))).map((o) => `${o.list}:${o.index}`));
  const strip = <T extends object>(list: 'pegs' | 'hazards' | 'sparks', arr: T[] | undefined) =>
    (arr ?? []).filter((_, i) => !drop.has(`${list}:${i}`)).map((e) => { const c = { ...e } as Opt<T>; delete c.opt; return c as T; });
  const def: LevelDef = { ...tpl, start, pegs: strip('pegs', tpl.pegs), hazards: strip('hazards', tpl.hazards), sparks: strip('sparks', tpl.sparks) };
  delete (def as Template).starts;
  delete def.solution;
  delete def.sparkSolution;
  if (!def.hazards?.length) delete def.hazards;
  if (!def.sparks?.length) delete def.sparks;
  // Keep portal pairs consistent if one side was dropped.
  const ids = new Set(def.pegs.map((p) => p.id));
  def.pegs = def.pegs.map((p) => (p.kind === 'portal' && (!p.pair || !ids.has(p.pair)) ? { ...p, kind: 'normal' as const, pair: undefined } : p));
  return def;
}

interface Scored { def: LevelDef; score: number; moves: number; secs: number; presses: number[]; all?: number[]; note: string }
let best: Scored | null = null;
const total = 1 << optional.length;
const seen = new Set<string>();

for (let t = 0; t < tries; t++) {
  // First try "everything on" for each start, then random subsets.
  const mask = t < starts.length ? total - 1 : Math.floor(rnd() * total);
  const start = starts[t < starts.length ? t : Math.floor(rnd() * starts.length)];
  const key = `${mask}|${start.peg}|${start.angle}|${start.dir}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const def = variant(mask, start);
  let level;
  try { level = compileLevel(def); } catch { continue; }
  const idle = runReplay(level, [], 90 * TICKS_PER_SEC).state.status;
  if (idle === 'won') continue;
  const sol = solve(level, { maxNodes: 6000, timeLimitMs: limit });
  if (!sol || sol.moves < minMoves || sol.moves > maxMoves) continue;
  const n = def.sparks?.length ?? 0;
  const all = n ? solve(level, { maxNodes: 6000, timeLimitMs: limit, allSparks: true }) : null;
  if (n && (!all || all.moves > maxMoves + 3)) continue;
  const secs = sol.ticks / TICKS_PER_SEC;
  // Chill pace: no more than one required tap every 1.2 seconds on average.
  if (sol.moves > 0 && secs < sol.moves * 1.2) continue;
  const keptIdx = [...Array(optional.length).keys()].filter((k) => mask & (1 << k));
  const isWall = (k: number) => optional[k].list === 'hazards' && (tpl.hazards?.[optional[k].index] as { kind?: string } | undefined)?.kind === 'wall';
  const keptWalls = keptIdx.filter(isWall).length;
  const kept = keptIdx.length - keptWalls;
  // Prefer the top of the move range, authored pieces kept, few thorns (less
  // clutter), and a calm pace.
  const pace = secs < 3 ? -2 : secs > 40 ? -2 : 0;
  const score = sol.moves * 3 + kept - keptWalls * wallCost + pace + (n ? 1 : 0);
  if (!best || score > best.score) {
    best = { def, score, moves: sol.moves, secs, presses: sol.presses, all: all?.presses, note: `mask=${mask} start=${start.angle}/${start.dir} idle=${idle}` };
  }
}

if (!best) {
  console.log(`✗ ${outPath}: no variant met the constraints`);
  process.exit(1);
}
const def = best.def;
def.par = { time: Math.ceil(best.secs * 1.5 + 4), moves: best.moves + (best.moves >= 3 ? 1 : 0) };
def.solution = best.presses;
if (best.all) def.sparkSolution = best.all;
writeFileSync(outPath, JSON.stringify(def, null, 2) + '\n');
console.log(`✓ ${outPath}: moves=${best.moves} time=${best.secs.toFixed(1)}s ${best.note}`);
