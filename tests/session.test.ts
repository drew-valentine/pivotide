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
