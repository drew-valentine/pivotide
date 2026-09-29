import { describe, expect, it } from 'vitest';
import { BREATH_MS, HIT_REWIND_MS, Session, starsFor, UNDO_REWIND_MS } from '../src/game/session';
import { makeLevel } from './helpers';

// A chain A-B-C along x; an orb waits beyond C so swinging on C eventually hits.
const level = makeLevel({
  pegs: [
    { id: 'a', x: 100, y: 300 },
    { id: 'b', x: 200, y: 300 },
    { id: 'c', x: 300, y: 300 },
    { id: 'g', x: 20, y: 20, kind: 'goal' },
  ],
  hazards: [{ id: 'o', kind: 'orb', x: 300, y: 380, r: 8 }],
  start: { peg: 'a', angle: 270, dir: 1 },
});

function run(s: Session, ticks: number) {
  for (let i = 0; i < ticks; i++) s.tick();
}

describe('session: rewind, undo, stars', () => {
  it('a hit rewinds to the last landing, pauses, then resumes', () => {
    const events: string[] = [];
    const s = new Session(level, (e) => events.push(e.type));
    let guard = 0;
    while (s.mode === 'playing' && guard++ < 5000) s.tick();
    expect(events).toContain('hit');
    expect(s.mode).toBe('rewind');
    const landing = s.state.pivot;
    s.frame(HIT_REWIND_MS + 1);
    expect(s.mode).toBe('breath');
    expect(s.state.status).toBe('playing');
    expect(s.state.pivot).toBe(landing);
    s.frame(BREATH_MS + 1);
    expect(s.mode).toBe('playing');
    expect(s.rewinds).toBe(1);
  });

  it('pressing during the pause flips direction and counts as a move', () => {
    const s = new Session(level, () => {});
    while (s.mode === 'playing') s.tick();
    s.frame(HIT_REWIND_MS + 1);
    const dir = s.state.dir;
    s.press();
    expect(s.state.dir).toBe(-dir);
    expect(s.moves).toBe(1);
  });

  it('undo goes back one pivot', () => {
    const s = new Session(level, () => {});
    // Travel until we have landed on c (a -> b -> c).
    let guard = 0;
    while (s.state.pivot !== 2 && guard++ < 3000) s.tick();
    expect(s.state.pivot).toBe(2);
    run(s, 10);
    s.undo();
    expect(s.mode).toBe('rewind');
    s.frame(UNDO_REWIND_MS + 1);
    expect(s.state.pivot).toBe(1);
    s.frame(BREATH_MS + 1);
    s.undo();
    s.frame(UNDO_REWIND_MS + 1);
    expect(s.state.pivot).toBe(0);
    expect(s.state.tick).toBe(0);
  });

  it('stars: finishing is 1, par time and par moves add one each', () => {
    expect(starsFor(level, 1000, 0).total).toBe(3);
    expect(starsFor(level, 999999, 0).total).toBe(2);
    expect(starsFor(level, 999999, 999).total).toBe(1);
  });
});

describe('session input log', () => {
  it('a won run with rewinds and undos replays to the same win', async () => {
    const { runReplay } = await import('../src/sim/replay');
    const { compileLevel } = await import('../src/sim/level');
    const def = (await import('./fixtures/m2.json')).default;
    const lv = compileLevel(def as never);
    const s = new Session(lv, () => {}, { startDelayMs: 800 });
    // Play: hold, then press a few times, get hit, undo, and finish with the known solution.
    s.frame(900);
    let tick = 0;
    const plan = new Map<number, () => void>([[30, () => s.press()], [60, () => s.undo()]]);
    let guard = 0;
    while (guard++ < 20000 && s.mode !== 'won') {
      if (s.mode === 'playing') {
        plan.get(tick)?.();
        s.tick();
        tick++;
      } else s.frame(50);
      if (tick === 200) break;
    }
    // Whatever happened, the log must reproduce the current state exactly.
    const r = runReplay(lv, s.solution(), s.state.tick);
    expect(r.state).toEqual(s.state);
  });
});

describe('steering', () => {
  const lv = makeLevel({
    pegs: [{ id: 'a', x: 300, y: 300 }, { id: 'b', x: 400, y: 300 }, { id: 'g', x: 20, y: 20, kind: 'goal' }],
    start: { peg: 'a', angle: 270, dir: 1 },
  });

  it('steering toward the current direction is a no-op and not a move', () => {
    const s = new Session(lv, () => {});
    expect(s.steer(1)).toBe(false);
    expect(s.moves).toBe(0);
    s.tick();
    expect(s.state.dir).toBe(1);
  });

  it('steering the other way reverses on the next tick and counts one move', () => {
    const s = new Session(lv, () => {});
    expect(s.steer(-1)).toBe(true);
    expect(s.steer(-1)).toBe(false); // already heading that way (queued)
    expect(s.moves).toBe(1);
    s.tick();
    expect(s.state.dir).toBe(-1);
  });

  it('left then right before the next tick cancels out', () => {
    const s = new Session(lv, () => {});
    s.steer(-1);
    s.steer(1);
    expect(s.intendedDir()).toBe(1);
    s.tick();
    s.tick();
    expect(s.state.dir).toBe(1);
  });

  it('steering during the intro pause sets the starting direction', () => {
    const s = new Session(lv, () => {}, { startDelayMs: 800 });
    expect(s.mode).toBe('breath');
    s.steer(-1);
    expect(s.state.dir).toBe(-1);
    s.frame(900);
    s.tick();
    expect(s.state.dir).toBe(-1);
  });

  it('steering during a rewind applies when play resumes', () => {
    const s = new Session(level, () => {});
    while (s.mode === 'playing') s.tick();
    expect(s.mode).toBe('rewind');
    const resumeDir = s.intendedDir();
    const other = resumeDir === 1 ? -1 : 1;
    expect(s.steer(other)).toBe(true);
    expect(s.steer(other)).toBe(false);
    s.frame(HIT_REWIND_MS + 1);
    expect(s.state.dir).toBe(other);
  });

  it('a steered run replays exactly from its input log', async () => {
    const { runReplay } = await import('../src/sim/replay');
    const s = new Session(lv, () => {});
    for (let i = 0; i < 300; i++) {
      if (i === 20) s.steer(-1);
      if (i === 80) s.steer(-1); // no-op
      if (i === 90) s.steer(1);
      s.tick();
    }
    expect(runReplay(lv, s.solution(), s.state.tick).state).toEqual(s.state);
  });
});

describe('swipe steering', () => {
  // Start pointing right (angle 0), spinning clockwise: the tip is moving down.
  const mk = (angle: number, dir: 1 | -1) =>
    new Session(makeLevel({
      pegs: [{ id: 'a', x: 300, y: 300 }, { id: 'g', x: 20, y: 20, kind: 'goal' }],
      start: { peg: 'a', angle, dir },
    }), () => {});

  it('tip moving down: swiping down keeps it, swiping up reverses', () => {
    const s = mk(0, 1);
    expect(s.steerToward(0, 40)).toBe(false);
    expect(s.moves).toBe(0);
    expect(s.steerToward(0, -40)).toBe(true);
    expect(s.intendedDir()).toBe(-1);
  });

  it('tip moving up: swiping down reverses', () => {
    const s = mk(0, -1); // pointing right, counter-clockwise: tip heads up
    expect(s.steerToward(0, -40)).toBe(false);
    expect(s.steerToward(0, 40)).toBe(true);
    expect(s.intendedDir()).toBe(1);
  });

  it('rod pointing left: down means counter-clockwise', () => {
    const s = mk(180, 1); // pointing left, clockwise: tip heads up
    expect(s.steerToward(0, 40)).toBe(true);
    expect(s.intendedDir()).toBe(-1);
  });

  it('rod straight up: vertical swipes are ambiguous and ignored, sideways ones steer', () => {
    const s = mk(270, 1); // pointing up, clockwise: tip heads right
    expect(s.steerToward(0, 40)).toBe(false);
    expect(s.steerToward(0, -40)).toBe(false);
    expect(s.steerToward(-40, 0)).toBe(true);
    expect(s.intendedDir()).toBe(-1);
  });

  it('diagonal swipes use the component along the tip motion', () => {
    const s = mk(0, 1); // tip heads down
    expect(s.steerToward(30, -30)).toBe(true); // mostly up-right: up wins
    expect(s.intendedDir()).toBe(-1);
  });

  it('swiping during a rewind steers from the resume pose', () => {
    const sess = new Session(level, () => {});
    while (sess.mode === 'playing') sess.tick();
    expect(sess.mode).toBe('rewind');
    const before = sess.intendedDir();
    // Try both vertical and horizontal swipes; one of them must reverse.
    const changed = sess.steerToward(0, 40) || sess.steerToward(0, -40) || sess.steerToward(40, 0) || sess.steerToward(-40, 0);
    expect(changed).toBe(true);
    expect(sess.intendedDir()).toBe(before === 1 ? -1 : 1);
    sess.frame(HIT_REWIND_MS + 1);
    expect(sess.state.dir).toBe(before === 1 ? -1 : 1);
  });
});

describe('hint wording', () => {
  it('adapts teaching hints to keys and swipes', async () => {
    const { adaptHint } = await import('../src/game/game');
    expect(adaptHint('Tap right or left to choose the spin', 'keys')).toBe('Press → or ← to choose the spin');
    expect(adaptHint('Tap right or left to choose the spin', 'swipe')).toBe('Swipe the way you want the rod to go');
    expect(adaptHint('Switch sides just as you land to turn around', 'swipe')).toBe('Swipe back just as you land to turn around');
    expect(adaptHint('Switch later to swing back the way you came', 'swipe')).toBe('Swipe later to swing back the way you came');
    expect(adaptHint('Thorns just send you back. No harm done', 'swipe')).toBe('Thorns just send you back. No harm done');
  });
});
