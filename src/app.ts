// App shell: title, level select, play, pause, settings. Owns the Game, audio
// and save data, and moves between screens with eased transitions.

import { AudioEngine } from './audio/engine';
import { Game, type WinResult } from './game/game';
import { ALL_LEVELS, WORLDS, duskFor, findLevel, type LevelEntry } from './game/levels';
import { Save } from './storage/save';
import { h, hideOverlay, showOverlay, formatTime } from './ui/dom';
import { ICONS } from './ui/icons';
import { settingsPanel } from './ui/settings';

type Screen = 'title' | 'levels' | 'play';

export class App {
  readonly save = new Save();
  readonly audio = new AudioEngine();
  readonly game: Game;
  private screen: Screen = 'title';
  private current: LevelEntry | null = null;
  private overlay: HTMLElement | null = null;
  private demo = false;
  private reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(stage: HTMLElement, private ui: HTMLElement) {
    this.game = new Game(stage, ui, {
      gesture: () => this.audio.unlock(),
      onEvent: (e, _s, level) => {
        if (this.demo) return;
        switch (e.type) {
          case 'pivot':
            this.audio.pivot(level.pegs[e.peg].kind, e.dir);
            this.buzz(8);
            break;
          case 'portal': this.audio.portal(); break;
          case 'reverse': this.audio.reverse(); break;
          case 'spark': this.audio.spark(); break;
          case 'hit':
            this.audio.hit();
            this.buzz([6, 40, 6]);
            break;
          case 'rewind-start': this.audio.rewind(); break;
          case 'won': this.audio.goal(); break;
        }
      },
      onWin: (r) => this.onWin(r),
      onNext: () => this.next(),
      onMenu: () => this.pause(),
      onLevels: () => this.showLevels(),
    });
    this.applySettings();
    window.addEventListener('resize', () => {
      if (this.demo) this.game.setFrameBand(this.titleBand());
    });
    this.reducedQuery.addEventListener('change', () => this.applySettings());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audio.suspend();
        if (this.screen === 'play' && !this.overlay && this.game.session?.mode !== 'won') this.pause();
      } else this.audio.resume();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat && !(e.target as HTMLElement).closest('input')) {
        this.save.updateSettings({ muted: !this.save.settings.muted });
        this.applySettings();
      }
    });

    const deep = new URLSearchParams(location.search).get('l');
    const entry = deep ? findLevel(deep) : undefined;
    if (entry) this.play(entry);
    else this.showTitle();
  }

  /** Light haptic tick, only after the user has interacted (browsers block it before). */
  private buzz(pattern: number | number[]): void {
    if (!this.save.settings.haptics || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  }

  // ---------------------------------------------------------------- settings

  applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.audio.setMuted(s.muted);
    const reduced = s.reducedMotion === 'on' || (s.reducedMotion === 'system' && this.reducedQuery.matches);
    this.game.renderer.opts.reducedMotion = reduced;
    document.documentElement.classList.toggle('reduced-motion', reduced);
    this.game.setStatsVisible(s.showStats);
  }

  // ---------------------------------------------------------------- screens

  private setScreen(screen: Screen): void {
    this.screen = screen;
    document.documentElement.dataset.screen = screen;
    this.game.input.enabled = screen === 'play';
  }

  private closeOverlay(): Promise<void> {
    const o = this.overlay;
    this.overlay = null;
    return o ? hideOverlay(o, 350) : Promise.resolve();
  }

  private openOverlay(el: HTMLElement, focus = true): void {
    void this.closeOverlay();
    this.overlay = el;
    this.ui.append(el);
    showOverlay(el);
    if (focus && !matchMedia('(pointer: coarse)').matches) {
      // Move focus into the dialog for keyboard and screen-reader users.
      requestAnimationFrame(() => (el.querySelector('[data-autofocus], button') as HTMLElement | null)?.focus({ preventScroll: true }));
    }
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        (el.querySelector('[data-back]') as HTMLElement | null)?.click();
      }
      if (e.key === 'Tab') trapFocus(el, e);
    });
  }

  showTitle(): void {
    this.setScreen('title');
    this.game.closeOverlay();
    this.startDemo();
    const last = this.save.data.last ? findLevel(this.save.data.last) : undefined;
    const nextUp = this.firstUnfinished();
    const started = Object.keys(this.save.data.levels).length > 0;
    const title = h('div', { class: 'screen title-screen', 'data-ui': '', role: 'dialog', 'aria-label': 'Pivotide' },
      h('div', { class: 'title-block' },
        h('div', { class: 'logo', 'aria-hidden': 'true', html: LOGO }),
        h('h1', { class: 'wordmark' }, 'Pivotide'),
        h('p', { class: 'tagline' }, 'A calm spin across the dunes'),
      ),
      h('div', { class: 'title-actions' },
        h('button', { class: 'btn primary big', 'data-autofocus': '', onclick: () => this.play(nextUp ?? last ?? ALL_LEVELS[0]) },
          started ? `Continue · ${(nextUp ?? last ?? ALL_LEVELS[0]).def.name}` : 'Play'),
        h('button', { class: 'btn big', onclick: () => this.showLevels() }, 'Levels'),
        h('button', { class: 'btn big ghost', onclick: () => this.showSettings(() => this.showTitle()) }, 'Settings'),
      ),
      h('p', { class: 'title-foot' }, 'Tap, click or press Space to reverse the spin'),
    );
    this.openOverlay(title);
  }

  private startDemo(): void {
    // Attract mode: the first level plays itself from its stored solution.
    const entry = ALL_LEVELS[0];
    this.demo = true;
    this.game.setHudVisible(false);
    // Keep the demo clear of the wordmark and buttons.
    this.game.setFrameBand(this.titleBand());
    this.game.load(entry.def, { eyebrow: '', dusk: 0.02, quiet: true });
    this.audio.setWorld(1);
    const sol = entry.def.solution ?? [];
    const run = () => {
      if (!this.demo || !this.game.session) return;
      this.game.session.script = new Set(sol);
    };
    run();
    this.game.onSessionWon = () => {
      if (!this.demo) return;
      setTimeout(() => {
        if (!this.demo) return;
        this.game.restart();
        run();
      }, 1800);
    };
  }

  /** Where the title demo may draw: between the text rows, or the centre column in landscape. */
  private titleBand(): { top: number; bottom: number; left?: number; right?: number } {
    const landscape = innerWidth > innerHeight * 1.25 && innerHeight < 560;
    return landscape ? { top: 0.08, bottom: 0.08, left: 0.36, right: 0.34 } : { top: 0.34, bottom: 0.4 };
  }

  private stopDemo(): void {
    this.demo = false;
    this.game.onSessionWon = null;
    this.game.setFrameBand(null);
  }

  showLevels(): void {
    this.setScreen('levels');
    if (!this.demo) {
      // Coming from play: keep the current level frozen behind the menu.
      this.game.loop.paused = true;
      this.game.setHudVisible(false);
      this.game.closeOverlay();
    }
    const worlds = WORLDS.map((w) => {
      const tiles = w.levels.map((entry) => {
        const rec = this.save.record(entry.def.id);
        const unlocked = this.isUnlocked(entry);
        const sparks = entry.def.sparks?.length ?? 0;
        const label = `${w.name} level ${entry.index + 1}, ${entry.def.name}${rec ? `, ${rec.stars} stars` : ''}${unlocked ? '' : ', locked'}`;
        return h('button', {
          class: `tile${rec ? ' done' : ''}${unlocked ? '' : ' locked'}`,
          disabled: !unlocked,
          'aria-label': label,
          title: entry.def.name,
          onclick: () => this.play(entry),
        },
          h('span', { class: 'num' }, String(entry.index + 1)),
          h('span', { class: 'tile-stars', 'aria-hidden': 'true' },
            ...[0, 1, 2].map((i) => h('span', { class: `mini-star${rec && i < rec.stars ? ' on' : ''}`, html: ICONS.star }))),
          sparks && rec && rec.sparks === sparks ? h('span', { class: 'tile-spark', 'aria-hidden': 'true' }, '✦') : null,
        );
      });
      const earned = w.levels.reduce((n, e) => n + (this.save.record(e.def.id)?.stars ?? 0), 0);
      return h('section', { class: `world world-${w.id}` },
        h('header', {},
          h('div', {}, h('h2', {}, w.name), h('p', {}, w.blurb)),
          h('span', { class: 'world-stars' }, h('span', { html: ICONS.star, 'aria-hidden': 'true' }), `${earned}/${w.levels.length * 3}`),
        ),
        h('div', { class: 'tiles' }, ...tiles),
      );
    });
    const el = h('div', { class: 'screen levels-screen', 'data-ui': '', role: 'dialog', 'aria-label': 'Choose a level' },
      h('div', { class: 'levels-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Back', 'data-back': '', html: ICONS.back, onclick: () => { this.game.loop.paused = false; this.showTitle(); } }),
        h('h1', {}, 'Levels'),
        h('span', { class: 'spacer' }),
      ),
      h('div', { class: 'levels-scroll' }, ...worlds),
    );
    this.openOverlay(el);
    // Scroll the next level into view.
    const next = this.firstUnfinished();
    if (next) requestAnimationFrame(() => el.querySelectorAll('.tile')[next.global]?.scrollIntoView({ block: 'center' }));
  }

  showSettings(back: () => void): void {
    const el = h('div', { class: 'screen settings-screen', 'data-ui': '', role: 'dialog', 'aria-label': 'Settings' },
      h('div', { class: 'card settings-card' },
        h('div', { class: 'levels-head' },
          h('button', { class: 'icon-btn', 'aria-label': 'Back', 'data-back': '', html: ICONS.back, onclick: back }),
          h('h1', {}, 'Settings'),
          h('span', { class: 'spacer' }),
        ),
        settingsPanel(this.save, () => this.applySettings(), () => this.audio.pivot('normal', 1)),
      ),
    );
    this.openOverlay(el);
  }

  // ---------------------------------------------------------------- play

  play(entry: LevelEntry): void {
    this.stopDemo();
    this.game.loop.paused = false;
    this.game.loop.resetClock();
    const prevWorld = this.current?.world;
    this.current = entry;
    this.save.setLast(entry.key);
    void this.closeOverlay();
    this.setScreen('play');
    this.game.setHudVisible(true);
    history.replaceState(null, '', `?l=${entry.key}`);
    const world = WORLDS[entry.world - 1];
    const load = () => {
      this.game.load(entry.def, { eyebrow: `${world.name} · ${entry.index + 1}`, dusk: duskFor(entry) });
      this.audio.setWorld(entry.world);
      this.audio.resetMelody();
    };
    if (prevWorld !== entry.world && entry.index === 0) {
      // Nothing may keep playing under the card (e.g. the title demo).
      this.game.clear();
      // Tint the sky for the new world while the card is up.
      this.game.applyTheme(entry.world, duskFor(entry));
      this.worldCard(world.name, world.blurb, load);
    } else this.game.transition(load);
  }

  /** A short title card over an empty sky when a new world begins; then the level fades in. */
  private worldCard(name: string, blurb: string, then: () => void): void {
    const card = h('div', { class: 'world-card', 'data-ui': '', role: 'status' },
      h('div', { class: 'eyebrow' }, 'Now entering'), h('h2', {}, name), h('p', {}, blurb));
    const canvas = this.game.renderer.canvas;
    canvas.classList.add('fading');
    this.game.setHudVisible(false);
    this.game.input.enabled = false;
    this.ui.append(card);
    showOverlay(card);
    const hold = this.game.renderer.opts.reducedMotion ? 1200 : 2000;
    window.setTimeout(() => {
      void hideOverlay(card, 700);
      window.setTimeout(() => {
        then();
        this.game.setHudVisible(true);
        this.game.input.enabled = this.screen === 'play';
        requestAnimationFrame(() => canvas.classList.remove('fading'));
      }, 450);
    }, hold);
  }

  private onWin(r: WinResult): { hasNext: boolean } {
    this.audio.win(r.stars.total);
    const entry = this.current;
    if (!entry || this.demo) return { hasNext: false };
    this.save.complete(entry.def.id, { stars: r.stars.total, bestTimeMs: r.timeMs, bestMoves: r.moves, sparks: r.sparks });
    return { hasNext: entry.global < ALL_LEVELS.length - 1 };
  }

  private next(): void {
    const entry = this.current;
    if (!entry) return;
    const nxt = ALL_LEVELS[entry.global + 1];
    if (nxt) this.play(nxt);
    else this.finale();
  }

  private finale(): void {
    this.showLevels();
  }

  pause(): void {
    if (this.screen !== 'play' || this.demo) return;
    if (this.overlay) {
      (this.overlay.querySelector('[data-back]') as HTMLElement | null)?.click();
      return;
    }
    const session = this.game.session;
    if (session?.mode === 'won') return;
    this.game.loop.paused = true;
    this.game.input.enabled = false;
    this.game.hideHint();
    const resume = () => {
      void this.closeOverlay();
      this.game.loop.paused = false;
      this.game.loop.resetClock();
      this.game.input.enabled = true;
    };
    const entry = this.current!;
    const rec = this.save.record(entry.def.id);
    const el = h('div', { class: 'overlay pause', 'data-ui': '', role: 'dialog', 'aria-label': 'Paused' },
      h('div', { class: 'card' },
        h('h2', {}, 'Paused'),
        h('p', { class: 'sub' }, `${entry.def.name} · par ${entry.def.par.moves} moves, ${entry.def.par.time}s`),
        rec ? h('p', { class: 'sub best' }, `Best: ${rec.stars}★ · ${formatTime(rec.bestTimeMs)} · ${rec.bestMoves} moves`) : null,
        h('div', { class: 'btn-col' },
          h('button', { class: 'btn primary', 'data-back': '', onclick: resume }, 'Resume'),
          h('button', { class: 'btn', onclick: () => { resume(); this.game.restart(); } }, 'Restart'),
          h('button', { class: 'btn', onclick: () => { resume(); this.showLevels(); } }, 'Levels'),
          h('button', { class: 'btn ghost', onclick: () => this.showSettings(() => { void this.closeOverlay(); this.pauseAgain(); }) }, 'Settings'),
        ),
      ),
    );
    this.openOverlay(el);
  }

  private pauseAgain(): void {
    this.overlay = null;
    this.pause();
  }

  // ---------------------------------------------------------------- progress

  private isUnlocked(entry: LevelEntry): boolean {
    // Finishing a level is always enough to progress, and you may skip one
    // level you are stuck on: a level opens when either of the two before it
    // is finished.
    if (entry.global < 2) return true;
    const done = (i: number) => !!this.save.record(ALL_LEVELS[i].def.id);
    return done(entry.global - 1) || done(entry.global - 2);
  }

  private firstUnfinished(): LevelEntry | undefined {
    return ALL_LEVELS.find((e) => !this.save.record(e.def.id) && this.isUnlocked(e));
  }
}

function trapFocus(root: HTMLElement, e: KeyboardEvent): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])'));
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

const LOGO = `<svg viewBox="0 0 120 120">
  <defs>
    <radialGradient id="lg-oasis" cx="40%" cy="35%"><stop offset="0" stop-color="#e9fffb"/><stop offset="1" stop-color="#8fdcd6"/></radialGradient>
  </defs>
  <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="0.1 7" stroke-linecap="round"/>
  <g class="logo-rod">
    <line x1="60" y1="60" x2="60" y2="8" stroke="#e6fbff" stroke-width="5" stroke-linecap="round"/>
    <circle cx="60" cy="8" r="3.5" fill="#e6fbff"/>
  </g>
  <circle cx="60" cy="60" r="8" fill="#fff8ec" stroke="currentColor" stroke-width="2"/>
  <circle cx="98" cy="84" r="7" fill="url(#lg-oasis)" stroke="#fff8ec" stroke-width="1.5"/>
</svg>`;
