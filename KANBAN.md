# Pivotide Kanban

Browser puzzle game. TypeScript + Vite, Canvas 2D (no engine), Vitest, deployed to GitHub Pages.
The player is a fixed-length rod rotating around a pivot peg. When the free end sweeps over another peg, that peg becomes the pivot. One button reverses rotation. Reach the goal peg.
Direction: relaxed. No lives, a soft 0.5s rewind on hazard hit, undo, optional par stars, generated Web Audio. Mobile-friendly first: phone portrait is the primary target, desktop second.
Art direction: desert sunset. A warm layered sky gradient and dune silhouettes, set against a cool pale-cyan rod glow. Crisp vector edges and restrained blur. Small, joyful sand-mote bursts on each pivot, and gentle bouncy easing in the UI. Each world is a time of evening:
- W1 Golden Hour: amber and peach.
- W2 Afterglow: rose and lavender.
- W3 Blue Hour: indigo and teal, with the first stars.
- W4 Moonrise: a crescent moon climbs (added in M6).
- W5 First Dawn: the sun rises, closing the day cycle (added in M6).

Card format: `- [ ] Title | P0-P3 | Size S/M/L/XL | Owner` followed by acceptance criteria (AC).
Branch: record the branch name on each card once work starts.

Decisions (2026-09-27):
- The user approved the plan.
- The name "Pivotide" is confirmed.
- The build agent (@builder) has autonomy to work through all milestones and iterate on design.
- Git is initialized. Each milestone gets its own branch, is merged to main when complete and stable, and is tagged:

| Milestone | Branch | Tag |
|---|---|---|
| M1 Core feel | m1-core | v0.1.0 |
| M2 Hazards and scoring | m2-hazards | v0.2.0 |
| M3 Special pegs, audio, polish | m3-specials | v0.3.0 |
| M4 Editor and levels | m4-editor-levels | v0.4.0 |
| M5 Shell, accessibility, deploy | m5-shell | v0.5.0 |
| M6 Thorns and new levels | m6-thorns, m6-levels | v0.5.3, v0.6.0 |

Feedback (2026-09-27): the user said "this is looking great so far" and asked for thornier walls, with good taste, and 20 more original levels. This opened M6.

## Backlog
- [ ] Bump GitHub Actions to Node 24 versions | P2 | S | Created: 2026-09-27 | Owner: unassigned
  - AC: actions/checkout, actions/setup-node, actions/configure-pages and actions/upload-pages-artifact use versions that run on Node 24; the Pages workflow still tests, builds and deploys with no Node 20 deprecation warning.
  - Why: GitHub warned on the first Actions run that Node 20 actions are deprecated.

## Ready
### Follow-ups after v0.5.0, all waiting on the user
- [ ] By-ear audio mix pass | P2 | S | Created: 2026-09-27 | Owner: @user
  - AC: pivot notes, chimes and ambient pads are balanced on real speakers and headphones. Audio was verified headless only.
- [ ] Human playtest of par values and difficulty order | P2 | M | Created: 2026-09-27 | Owner: @user
  - AC: pars are tuned by play and levels are reordered where needed. Some late levels need only 1 or 2 moves.
- [ ] Level geometry variety pass (optional) | P3 | L | Created: 2026-09-27 | Owner: @user
  - AC: more layouts break away from the hex-patch pattern while keeping all level tests green.
  - Largely addressed by M6 "20 new levels" (v0.6.0), which added pentagons, a heptagon, arcs, spirals, a star and lifts. What remains is reshaping the older hex-patch levels in W1 to W3, if wanted.
- [ ] Offline service worker (optional) | P3 | S | Created: 2026-09-27 | Owner: @user
  - AC: after one visit, the game and levels load offline.

## In Progress

## Review

## Done
- [x] Write plan: file structure, sim data model, collision approach | P0 | M | Completed: 2026-09-27 | Owner: @planner
  - Approved by the user on 2026-09-27.

### M1 Core feel
- [x] Project scaffold | P0 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: `npm run dev`, `npm run build` and `npm test` (Vitest) all pass on a fresh clone; TypeScript strict mode on.
- [x] Deterministic math module | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: integer angle units; polynomial sin/cos/atan2 with no `Math.sin`/`Math.cos`/`Math.atan2` in sim code; max error documented and tested.
- [x] Fixed-timestep loop with interpolated rendering | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: sim ticks at a fixed rate independent of frame rate; renderer interpolates between the last two states; a tab switch does not cause a spiral of catch-up ticks.
- [x] Rod rotation | P0 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: given a pivot and direction, the free end advances by a constant angular step per tick.
- [x] Pivot transfer with snap radius and re-arm rule | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: when the free end passes within the snap radius of a peg, that peg becomes the pivot and the rod stays continuous; the peg just left cannot recapture until the rod has moved out of its radius.
- [x] Reversal input (key, mouse, touch) | P0 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: Space, click and tap each reverse rotation on the next tick; input is queued as a sim command, never applied mid-tick.
  - AC: pointer input listens on `pointerdown` for low latency; the canvas sets `touch-action: none`, so taps never scroll, pinch-zoom or double-tap zoom the page.
  - AC: tapping a HUD button (undo, pause) does not reverse rotation.
- [x] Goal detection | P0 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: transferring onto the goal peg ends the level and shows a complete state.
- [x] One test level | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: a hand-written level loads from data and is completable in under a minute.
- [x] Camera fit and follow | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: levels are authored in portrait-friendly bounds (aspect between about 9:16 and 1:1), and the camera fits the whole level on a phone screen.
  - AC: follow mode exists only as a fallback for a level that cannot fit; it tracks the pivot smoothly without clipping the rod.
- [x] Mobile shell basics | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: viewport meta tag set (`width=device-width, initial-scale=1, viewport-fit=cover`); HUD and canvas respect safe-area insets.
  - AC: canvas backing store uses devicePixelRatio, capped at 2 on mobile.
  - AC: resize and orientation changes re-fit the canvas and camera without a reload.
  - AC: on `visibilitychange` to hidden, the game auto-pauses and the audio context suspends; it resumes paused, waiting for the player.
- [x] Tests: pivot transfer, snap radius, determinism | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - AC: identical input sequences produce identical state hashes after N ticks; snap radius edge cases (just inside, just outside, re-arm) covered.
- [x] M1 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m1-core
  - Merged to main and tagged v0.1.0 on 2026-09-27.
  - 33 Vitest tests pass (math, geometry, pivot, snap, determinism with golden trace, solver). Build passes (32 KB JS).
  - Added beyond plan: level solver (src/sim/solver.ts, scripts/solve.ts) to prove solvability and suggest par. Goal peg drawn as a cool "oasis" with ripples (a sun icon clashed with the backdrop sun). Camera frames level content, not declared bounds.
  - Concern: dense peg lattices let the rod drift to the goal with zero presses; level design must break auto-paths (solver reports idle wins).
  - Concern: Chrome extension unavailable; visual checks use headless Playwright screenshots.


### M2 Hazards and scoring
- [x] Walls | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: static segments; any contact with the whole rod counts as a hit.
- [x] Drifting orbs on paths | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: circles move along polyline or loop paths at deterministic speed; positions are a function of tick.
- [x] Rotating blades | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: segments rotate about a center at a fixed rate; hit checked against the whole rod.
- [x] Whole-rod collision (segment vs circle, segment vs segment) | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: checks the full rod each tick, including swept motion, so fast rotation cannot tunnel through thin hazards.
- [x] Soft rewind to last pivot | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: on hit, state eases back over 0.5s to the moment the rod took its last pivot; no life lost, no restart screen.
- [x] Undo key | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: Z or the on-screen undo button steps back one pivot transfer; repeatable to level start.
  - AC: the undo button has a touch target of at least 44x44 CSS px and sits inside the safe area.
- [x] Stars: par time and par moves | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: level data holds par time and par reversal count; results screen awards 0-2 stars; stars never block progress.
- [x] Tests: collision | P0 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - AC: tangent, endpoint, parallel, overlapping and tunneling cases pass for both collision types.
- [x] M2 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m2-hazards
  - Merged to main and tagged v0.2.0 on 2026-09-27.
  - 46 Vitest tests pass (added collision, tunnelling, and session rewind/undo/stars). Build passes.
  - Undo rewinds one pivot: Z or Backspace, or a 52px on-screen button at bottom right.
  - A press during the rewind or the settling pause sets the direction used when play resumes.
  - The HUD shows time and moves under the level title.
  - The hazard hit chime moved to the M3 Web Audio card.
  - Concern: a hit soon after landing gives a very short rewind because there is little to replay. It works but reads less clearly.
  - Concern: levels must not force a press in the first few ticks.

### M3 Special pegs, audio, polish
- [x] Speed pegs (up and down) | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: pivoting on the peg changes angular speed until the next transfer.
- [x] Auto-reverse peg | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: pivoting on the peg flips direction once, on capture.
- [x] One-use peg | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: the peg disappears after the rod leaves it; undo and rewind restore it.
- [x] Moving pegs on rails | P2 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: the peg follows a rail path; the rod stays attached and moves with it while pivoting.
- [x] Portal peg pairs | P2 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: capturing one peg of a pair moves the pivot to its partner, keeping angle and direction.
- [x] Spark collectibles | P3 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: touching a spark with the rod collects it; per-level count is saved; optional for completion.
- [x] Web Audio | P2 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: pentatonic note on each pivot transfer; chime on goal; volume slider and mute; audio starts only after a user gesture.
  - AC: a soft chime plays on hazard hit (moved from M2).
  - AC: iOS audio unlock: the audio context is created or resumed inside the first touch handler, so sound works on iPhone Safari.
  - AC: generated per-world ambient pads match the evening palette: warm for W1 Golden Hour, airy for W2 Afterglow, cool with high shimmer for W3 Blue Hour.
- [x] Visual polish | P2 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: follows the desert sunset art direction in the header: layered sky gradient and dune silhouettes per world, cool pale-cyan rod glow, crisp vector edges with restrained blur, sand-mote burst on each pivot, bouncy eased screen transitions.
  - AC: particles (trails and sand motes) stay within a fixed mobile budget, with a lower cap than desktop; holds 60fps on a mid-range phone.
- [x] Optional haptics | P3 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - AC: a light `navigator.vibrate` pulse on each pivot transfer where the API exists; no errors where it does not (e.g. iOS Safari).
  - AC: a haptics toggle in Settings turns it off, and the choice persists.
- [x] M3 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m3-specials
  - Merged to main and tagged v0.3.0 on 2026-09-27.
  - 56 Vitest tests pass (added special pegs and save). Build passes (51 KB JS, 18 KB gzip).
  - Audio unlocks on pointerup, touchend or keydown. Browsers do not count a touch pointerdown as user activation; testing caught this as a real mobile bug.
  - Pegs pop in on level start and the rod holds for 0.8s; the par timer does not run during the hold.
  - Settings and progress storage (src/storage/save.ts) landed early; haptics can be toggled.
  - Concern: the audio mix was verified headless only. The user should listen for balance.
  - Concern: Blue Hour hazards are dark on dark and rely on their light edge lines to read.

### M4 Editor and levels
- [x] Level editor at /editor | P1 | L | Completed: 2026-09-27 | Owner: @builder | Branch: m4-editor-levels
  - AC: place, drag and delete pegs and hazards; draw orb paths and rails; test-play from the editor; import and export level JSON that the game loads unchanged.
- [x] 30 levels across 3 worlds in /levels | P1 | XL | Completed: 2026-09-27 | Owner: @builder | Branch: m4-editor-levels
  - AC: 10 levels per world stored as JSON; each is completable and has a par set by playtest; difficulty rises within each world.
  - AC: all 30 levels fit portrait-friendly bounds (aspect between about 9:16 and 1:1), so none needs follow mode on a phone.
  - AC: Blue Hour hazards stay readable against the dark sky (see M3 concern).
- [x] Teaching levels with hints | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m4-editor-levels
  - AC: the first 3 levels each introduce one idea with a one-line hint shown in play.
- [x] M4 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m4-editor-levels
  - Merged to main and tagged v0.4.0 on 2026-09-27.
  - 242 Vitest tests pass. Each of the 30 levels stores a reference solution and a spark run. Tests replay both to prove the level is solvable, and check that idling never wins, par is consistent, and the level fits a phone.
  - Editor at /editor solves in a Web Worker, test-plays in place, and saves a winning run as the level's solution. It also has lattice snapping, rails, orbits, undo, and import/export.
  - Mechanic change: after a landing, the previous peg is pass-through for about 36 degrees and is drawn ghosted. A quick tap turns the rod around its new pivot; a later tap swings back. Analysis showed that with instant re-arming, taps could never create route choices, because the rotation rule is invertible.
  - Tooling: scripts/design.ts searches hand-authored level skeletons for start poses and optional pieces that meet move and pace targets. scripts/solve.ts and scripts/tune.ts support design.
  - Concern: many levels need only 1 to 4 taps, so difficulty comes more from timing and hazards than from long routes.
  - Concern: some late levels are easier than their position suggests; w3-06 and w3-07 each need 1 move.
  - Concern: layouts are fairly uniform hex patches.
  - Concern: par values come from the solver and have not been tuned by human play.

### M5 Shell, accessibility, deploy
- [x] Menus and level select | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: title, world and level select showing stars, sparks and locks; pause menu with restart and quit.
- [x] Settings | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: volume, mute, reduced motion, colorblind and haptics options, all persisted.
- [x] localStorage save | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: progress, stars, sparks and settings survive reload; a corrupt or missing save falls back to defaults.
- [x] Reduced motion | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: honors `prefers-reduced-motion` and the setting; disables particles, screen shake and camera easing.
- [x] Colorblind-safe hazard shapes | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: every hazard and special peg type is identifiable by shape alone.
- [x] Scaling from phone portrait to 4K | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: canvas sized by devicePixelRatio (capped per "Mobile shell basics"); layout usable at 360x740 portrait and sharp at 3840x2160.
- [x] PWA manifest + theme color (add to home screen) | P2 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - AC: web app manifest with name, icons and `display: standalone`; `theme-color` meta matches the sky palette.
- [x] Mobile verification pass | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - Checked at 390x844, 360x740, 844x390 landscape, 1024x1366 tablet, 1440x900 desktop and 3840x2160. Keyboard-only flow tested.
- [x] GitHub Pages deploy workflow | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - Workflow on Node 22 with BASE_PATH from the repo name. Production build verified locally under /pivotide/ (game, editor and manifest load). Live URL waits on the repo card in Ready.
- [x] M5 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | Completed: 2026-09-27 | Owner: @builder | Branch: m5-shell
  - Merged to main and tagged v0.5.0 on 2026-09-27.
  - 242 Vitest tests pass. Build passes.
  - Fixed during verification: the hidden title demo could "win" under the world card and record progress; Blue Hour rails were invisible; the landscape title overflowed; vibration was called before user activation.

### Release follow-ups
- [x] Create GitHub repo, push, enable Pages with "GitHub Actions" as the source | P1 | S | Completed: 2026-09-27 | Owner: @user
  - AC: the workflow publishes on push to main; game and /editor load on the live URL.
  - The user approved this outward-facing step.
  - Repo: https://github.com/drew-valentine/pivotide (public).
  - Site: https://drew-valentine.github.io/pivotide/ with the editor at /pivotide/editor/.
  - The first Actions run passed tests, built and deployed. It warned that Node 20 actions are deprecated; see the Backlog card.

### M6 Thorns and new levels
- [x] Thornier walls | P1 | M | Completed: 2026-09-27 | Owner: @builder | Branch: m6-thorns
  - AC: walls read as thorny stems at a glance, with curved thorns along both sides.
  - AC: the look stays crisp and calm, and reads in all palettes.
  - AC: the drawn silhouette stays within a few units of the collision capsule.
  - AC: walls stay distinct in shape from spiked embers and serrated blades.
  - Merged to main and tagged v0.5.3. Walls are now tapered briar stems with hooked thorns, and they read in all palettes.
- [x] 20 new levels | P1 | XL | Completed: 2026-09-27 | Owner: @builder | Branch: m6-levels
  - AC: 20 original levels, added as new worlds or as extensions of existing ones; the build decides which.
  - AC: each level has a stored solution that tests replay; idling never wins; each fits a phone.
  - AC: difficulty ramps, and layouts vary more than the current hex patches.
  - AC: the new levels appear in level select.
  - AC: deploy after merge.
  - Merged to main, tagged v0.6.0, and deployed to https://drew-valentine.github.io/pivotide/.
  - Two new worlds complete the day cycle: Moonrise (w4) and First Dawn (w5). Each has its own palette and ambient pad. The crescent moon climbs through W4 and the sun rises in W5.
  - Layouts move off the hex grid: pentagons, a heptagon, arcs, spirals, a star and lifts.
  - 412 Vitest tests pass. A new check rejects overlapping pegs; it found a duplicate peg in w2-10, which was fixed.
  - Concern: some new levels use small "guard" thorns to force turn-around taps. Dew (w5-02) has five, which looks busy.
  - Concern: par values are still derived by the solver, not by human play.
  - Concern: Firefly Path (w4-04) takes about 20 seconds to play.
