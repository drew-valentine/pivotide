# Pivotide

A calm one-button puzzle game for the browser. You are a rod spinning around a
peg at the edge of a desert at sunset. When the free end sweeps over another
peg, that peg becomes the new pivot. Your only move is choosing which way it
spins. Reach the oasis.

Fifty levels across five worlds follow one evening into the next morning: Golden Hour, Afterglow, Blue Hour, Moonrise and First Dawn.

There are no lives and no game over. Touching a thorn rewinds you to the last
peg you landed on. Stars for par time and par moves are optional.

## Playing

| Action | Touch | Mouse | Keyboard |
| --- | --- | --- | --- |
| Spin clockwise | tap the right half | click the right half | → or D |
| Spin counter-clockwise | tap the left half | click the left half | ← or A |
| Flip the spin (one-switch play) | | | Space |
| Undo (rewind one peg) | ↶ button | ↶ button | Z or Backspace |
| Restart | ⟲ button | ⟲ button | R |
| Pause | ‖ button | ‖ button | Esc or P |
| Mute | Settings | Settings | M |

**Two kinds of tap:**

Choosing the direction the rod is already spinning does nothing, and it isn't
counted as a move.

- **Turn around:** right after the rod lands, the peg it came from lets the rod
  pass through for about a tenth of a turn. That peg is drawn as a ghost. If you
  switch direction inside that window, the rod turns around its new pivot.
- **Swing back:** if you switch later, the rod swings back onto the peg it came from.

**Pegs and hazards.** Each kind has its own shape, so none of them depends on
colour alone:

- **Pegs**
  - Swift pegs (»)
  - Soft-sand pegs (≈)
  - Arrow pegs that flip your spin (⟲)
  - Dashed pegs that crumble after one use
  - Swirling portal pegs, linked in pairs (the dots show which pairs belong together)
  - Pegs that ride dotted rails or orbits
- **Hazards**
  - Hatched thorn walls
  - Spiked drifting embers
  - Serrated turning blades

## Development

```sh
npm install
npm run dev       # game at http://localhost:5173/, editor at /editor/
npm test          # Vitest: sim, collision, determinism, sessions, all 50 levels
npm run build     # type-check and build to dist/
```

TypeScript, Vite and Canvas 2D. There are no runtime dependencies.

### Layout

```
src/sim/       pure, deterministic simulation (no DOM, clock or randomness)
  fixed.ts     integer angles; sin/cos/atan2 from + and * only
  geom.ts      segment-circle and segment-segment distance
  step.ts      one fixed tick: rotation, pivot capture, sparks, hazards
  level.ts     JSON validation and compilation
  paths.ts     rails and orbits as pure functions of time
  solver.ts    fewest-reversal search used by tests, the editor and scripts
  replay.ts    replays and state hashes
src/game/      session (rewind, undo, stars), fixed-step loop, level catalogue
src/render/    canvas renderer, camera, particles, palettes, SVG backdrop
src/audio/     Web Audio: world pads, pentatonic landing notes, effects
src/input/     pointer and keyboard input
src/ui/        DOM helpers, icons, settings panel
src/editor/    the level editor (and its solver worker)
src/app.ts     title, level select, pause, settings, progression
levels/        50 levels as JSON, ordered by levels/index.json
scripts/       level design tools (see below)
tests/         Vitest suites and fixtures
```

### Determinism

The simulation runs at a fixed 120 ticks per second, and rendering interpolates
between ticks. Angles are integers (2^20 units per turn). Trigonometry uses
polynomials built only from addition and multiplication, and IEEE-754
guarantees those operations round identically on every JavaScript engine.
Moving pieces are pure functions of the tick. So a run is fully described by
the ticks on which the spin changed direction. `tests/determinism.test.ts` checks that
against a committed golden trace.

### Collision

The rod is a capsule from pivot to tip. Walls and blades are capsules too, and
embers are circles. Each tick is split into substeps, so the fastest moving
point never travels more than half the thinnest gap. That stops fast rotation
from passing through thin walls.

## Levels

Levels are JSON files in `levels/`. Here is an illustrative example (not a shipped level):

```json
{
  "id": "w1-99",
  "name": "Example Dune",
  "world": 1,
  "hint": "A one-line hint, shown briefly at the start",
  "start": { "peg": "p0", "angle": 210, "dir": -1 },
  "bounds": { "w": 416, "h": 398 },
  "pegs": [
    { "id": "p0", "x": 130, "y": 330 },
    { "id": "p3", "x": 280, "y": 243.4, "kind": "slow" },
    { "id": "goal", "x": 180, "y": 70, "kind": "goal" }
  ],
  "hazards": [{ "id": "w1", "kind": "wall", "x1": 305, "y1": 203, "x2": 305, "y2": 283, "r": 6 }],
  "sparks": [{ "id": "s1", "x": 95, "y": 243 }],
  "par": { "time": 12, "moves": 3 },
  "solution": [8, 131, 260]
}
```

`solution` lists the ticks on which to press reverse, and replaying it must
win. The test suite replays every level's `solution` and `sparkSolution`. It
also checks that doing nothing never wins, that the level fits a phone in
portrait, and that par is consistent.

### Editor

Open `/editor/`. It can:

- place and drag pegs, hazards and sparks (lattice snapping is on by default; hold Alt to place freely)
- add rails and orbits
- set the start angle by dragging the rod tip
- solve the level in a background worker and suggest par values
- test-play in place; if you win a test play, that run becomes the level's reference solution
- import and export JSON

### Design scripts

```sh
npx tsx scripts/solve.ts levels/w1/*.json --trace   # routes, par, checks
npx tsx scripts/tune.ts levels/w2/03.json           # compare start poses
npx tsx scripts/design.ts skeleton.json out.json 2 4
```

`design.ts` takes a hand-authored skeleton where some pieces are marked
`"opt": true` and a list of candidate start poses. It keeps the variant that
meets the move-count and pace targets.

## Deploying

`.github/workflows/deploy.yml` runs on every push to `main`: it runs the tests,
builds with `BASE_PATH` set from the repository name, and publishes `dist/` to
GitHub Pages. To turn it on for a repository, open Settings → Pages and choose
"GitHub Actions" as the source.
