# Pivotide Kanban

Browser puzzle game. TypeScript + Vite, Canvas 2D (no engine), Vitest, deployed to GitHub Pages.
The player is a fixed-length rod rotating around a pivot peg. When the free end sweeps over another peg, that peg becomes the pivot. One button reverses rotation. Reach the goal peg.
Direction: relaxed. No lives, a soft 0.5s rewind on hazard hit, undo, optional par stars, generated Web Audio. Mobile-friendly first: phone portrait is the primary target, desktop second.
Art direction: desert sunset. A warm layered sky gradient and dune silhouettes, set against a cool pale-cyan rod glow. Crisp vector edges and restrained blur. Small, joyful sand-mote bursts on each pivot, and gentle bouncy easing in the UI. Each world is a time of evening:
- W1 Golden Hour: amber and peach.
- W2 Afterglow: rose and lavender.
- W3 Blue Hour: indigo and teal, with the first stars.

Card format: `- [ ] Title | P0-P3 | Size S/M/L/XL | Owner` followed by acceptance criteria (AC).
Branch: not yet a git repo. Record the branch name on each card once work starts.

## Backlog

### M1 Core feel
- [ ] Project scaffold | P0 | S | unassigned
  - AC: `npm run dev`, `npm run build` and `npm test` (Vitest) all pass on a fresh clone; TypeScript strict mode on.
- [ ] Deterministic math module | P0 | M | unassigned
  - AC: integer angle units; polynomial sin/cos/atan2 with no `Math.sin`/`Math.cos`/`Math.atan2` in sim code; max error documented and tested.
- [ ] Fixed-timestep loop with interpolated rendering | P0 | M | unassigned
  - AC: sim ticks at a fixed rate independent of frame rate; renderer interpolates between the last two states; a tab switch does not cause a spiral of catch-up ticks.
- [ ] Rod rotation | P0 | S | unassigned
  - AC: given a pivot and direction, the free end advances by a constant angular step per tick.
- [ ] Pivot transfer with snap radius and re-arm rule | P0 | M | unassigned
  - AC: when the free end passes within the snap radius of a peg, that peg becomes the pivot and the rod stays continuous; the peg just left cannot recapture until the rod has moved out of its radius.
- [ ] Reversal input (key, mouse, touch) | P0 | S | unassigned
  - AC: Space, click and tap each reverse rotation on the next tick; input is queued as a sim command, never applied mid-tick.
  - AC: pointer input listens on `pointerdown` for low latency; the canvas sets `touch-action: none`, so taps never scroll, pinch-zoom or double-tap zoom the page.
  - AC: tapping a HUD button (undo, pause) does not reverse rotation.
- [ ] Goal detection | P0 | S | unassigned
  - AC: transferring onto the goal peg ends the level and shows a complete state.
- [ ] One test level | P1 | S | unassigned
  - AC: a hand-written level loads from data and is completable in under a minute.
- [ ] Camera fit and follow | P1 | M | unassigned
  - AC: levels are authored in portrait-friendly bounds (aspect between about 9:16 and 1:1), and the camera fits the whole level on a phone screen.
  - AC: follow mode exists only as a fallback for a level that cannot fit; it tracks the pivot smoothly without clipping the rod.
- [ ] Mobile shell basics | P0 | M | unassigned
  - AC: viewport meta tag set (`width=device-width, initial-scale=1, viewport-fit=cover`); HUD and canvas respect safe-area insets.
  - AC: canvas backing store uses devicePixelRatio, capped at 2 on mobile.
  - AC: resize and orientation changes re-fit the canvas and camera without a reload.
  - AC: on `visibilitychange` to hidden, the game auto-pauses and the audio context suspends; it resumes paused, waiting for the player.
- [ ] Tests: pivot transfer, snap radius, determinism | P0 | M | unassigned
  - AC: identical input sequences produce identical state hashes after N ticks; snap radius edge cases (just inside, just outside, re-arm) covered.
- [ ] M1 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | unassigned

### M2 Hazards and scoring
- [ ] Walls | P1 | S | unassigned
  - AC: static segments; any contact with the whole rod counts as a hit.
- [ ] Drifting orbs on paths | P1 | M | unassigned
  - AC: circles move along polyline or loop paths at deterministic speed; positions are a function of tick.
- [ ] Rotating blades | P1 | M | unassigned
  - AC: segments rotate about a center at a fixed rate; hit checked against the whole rod.
- [ ] Whole-rod collision (segment vs circle, segment vs segment) | P0 | M | unassigned
  - AC: checks the full rod each tick, including swept motion, so fast rotation cannot tunnel through thin hazards.
- [ ] Soft rewind to last pivot | P0 | M | unassigned
  - AC: on hit, state eases back over 0.5s to the moment the rod took its last pivot; no life lost, no restart screen.
- [ ] Undo key | P1 | S | unassigned
  - AC: Z or the on-screen undo button steps back one pivot transfer; repeatable to level start.
  - AC: the undo button has a touch target of at least 44x44 CSS px and sits inside the safe area.
- [ ] Stars: par time and par moves | P2 | S | unassigned
  - AC: level data holds par time and par reversal count; results screen awards 0-2 stars; stars never block progress.
- [ ] Tests: collision | P0 | M | unassigned
  - AC: tangent, endpoint, parallel, overlapping and tunneling cases pass for both collision types.
- [ ] M2 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | unassigned

### M3 Special pegs, audio, polish
- [ ] Speed pegs (up and down) | P2 | S | unassigned
  - AC: pivoting on the peg changes angular speed until the next transfer.
- [ ] Auto-reverse peg | P2 | S | unassigned
  - AC: pivoting on the peg flips direction once, on capture.
- [ ] One-use peg | P2 | S | unassigned
  - AC: the peg disappears after the rod leaves it; undo and rewind restore it.
- [ ] Moving pegs on rails | P2 | M | unassigned
  - AC: the peg follows a rail path; the rod stays attached and moves with it while pivoting.
- [ ] Portal peg pairs | P2 | M | unassigned
  - AC: capturing one peg of a pair moves the pivot to its partner, keeping angle and direction.
- [ ] Spark collectibles | P3 | S | unassigned
  - AC: touching a spark with the rod collects it; per-level count is saved; optional for completion.
- [ ] Web Audio | P2 | M | unassigned
  - AC: pentatonic note on each pivot transfer; chime on goal; volume slider and mute; audio starts only after a user gesture.
  - AC: iOS audio unlock: the audio context is created or resumed inside the first touch handler, so sound works on iPhone Safari.
  - AC: generated per-world ambient pads match the evening palette: warm for W1 Golden Hour, airy for W2 Afterglow, cool with high shimmer for W3 Blue Hour.
- [ ] Visual polish | P2 | M | unassigned
  - AC: follows the desert sunset art direction in the header: layered sky gradient and dune silhouettes per world, cool pale-cyan rod glow, crisp vector edges with restrained blur, sand-mote burst on each pivot, bouncy eased screen transitions.
  - AC: particles (trails and sand motes) stay within a fixed mobile budget, with a lower cap than desktop; holds 60fps on a mid-range phone.
- [ ] Optional haptics | P3 | S | unassigned
  - AC: a light `navigator.vibrate` pulse on each pivot transfer where the API exists; no errors where it does not (e.g. iOS Safari).
  - AC: a haptics toggle in Settings turns it off, and the choice persists.
- [ ] M3 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | unassigned

### M4 Editor and levels
- [ ] Level editor at /editor | P1 | L | unassigned
  - AC: place, drag and delete pegs and hazards; draw orb paths and rails; test-play from the editor; import and export level JSON that the game loads unchanged.
- [ ] 30 levels across 3 worlds in /levels | P1 | XL | unassigned
  - AC: 10 levels per world stored as JSON; each is completable and has a par set by playtest; difficulty rises within each world.
  - AC: all 30 levels fit portrait-friendly bounds (aspect between about 9:16 and 1:1), so none needs follow mode on a phone.
- [ ] Teaching levels with hints | P1 | S | unassigned
  - AC: the first 3 levels each introduce one idea with a one-line hint shown in play.
- [ ] M4 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | unassigned

### M5 Shell, accessibility, deploy
- [ ] Menus and level select | P1 | M | unassigned
  - AC: title, world and level select showing stars, sparks and locks; pause menu with restart and quit.
- [ ] Settings | P2 | S | unassigned
  - AC: volume, mute, reduced motion, colorblind and haptics options, all persisted.
- [ ] localStorage save | P1 | S | unassigned
  - AC: progress, stars, sparks and settings survive reload; a corrupt or missing save falls back to defaults.
- [ ] Reduced motion | P2 | S | unassigned
  - AC: honors `prefers-reduced-motion` and the setting; disables particles, screen shake and camera easing.
- [ ] Colorblind-safe hazard shapes | P2 | S | unassigned
  - AC: every hazard and special peg type is identifiable by shape alone.
- [ ] Scaling from phone portrait to 4K | P1 | M | unassigned
  - AC: canvas sized by devicePixelRatio (capped per "Mobile shell basics"); layout usable at 360x740 portrait and sharp at 3840x2160.
- [ ] PWA manifest + theme color (add to home screen) | P2 | S | unassigned
  - AC: web app manifest with name, icons and `display: standalone`; `theme-color` meta matches the sky palette; the game can be added to the home screen on iOS and Android and launches full screen.
- [ ] Mobile verification pass | P1 | M | unassigned
  - AC: using browser automation, the game and menus are checked at 390x844 and 360x740 portrait, a landscape phone, a tablet, desktop and 4K.
  - AC: at each size the whole level is visible, HUD buttons clear the safe area, taps reverse without zooming or scrolling, and text is legible; defects become cards.
- [ ] GitHub Pages deploy workflow | P1 | S | unassigned
  - AC: Actions workflow builds and publishes on push to main; Vite `base` matches the repo path; game and /editor both load on the live URL.
- [ ] M5 wrap-up: run tests + build, summarize, list gameplay concerns | P1 | S | unassigned

## Ready

## In Progress

## Review
- [ ] Write plan: file structure, sim data model, collision approach | P0 | M | Review started: 2026-09-27 | Owner: @planner
  - Awaiting user approval. Nothing moves to Ready until the plan is approved.

## Done
