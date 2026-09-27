// Wires a level session to the renderer, loop, input and HUD.

import { compileLevel, type CompiledLevel } from '../sim/level';
import type { LevelDef, WorldState } from '../sim/types';
import { Backdrop } from '../render/background';
import type { Insets } from '../render/camera';
import { paletteFor, type Palette } from '../render/palette';
import { Renderer } from '../render/renderer';
import { Input } from '../input/input';
import { h, hideOverlay, showOverlay, formatTime } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { Loop } from './loop';
import { Session, starsFor, type SessionEvent, type Stars } from './session';

export interface WinResult {
  stars: Stars;
  timeMs: number;
  moves: number;
  sparks: number;
  totalSparks: number;
}

export interface GameHooks {
  onEvent?(e: SessionEvent, s: WorldState, level: CompiledLevel): void;
  /** Called when a level is won; return value controls the win card buttons. */
  onWin?(result: WinResult): { hasNext: boolean } | void;
  onNext?(): void;
  onMenu?(): void;
  onLevels?(): void;
  gesture?(): void;
}

export interface LoadOptions {
  eyebrow: string;
  /** 0..1 progress through the game; the sun sinks as it grows. */
  dusk: number;
  /** Skip the hint (attract mode). */
  quiet?: boolean;
}

export class Game {
  readonly backdrop: Backdrop;
  readonly renderer: Renderer;
  readonly loop: Loop;
  readonly input: Input;
  session: Session | null = null;
  level: CompiledLevel | null = null;
  palette: Palette = paletteFor(1);
  showStats = true;
  /** Called when the current session is won (used by the title-screen demo). */
  onSessionWon: (() => void) | null = null;
  private hud: HTMLElement;
  private titleEyebrow: HTMLElement;
  private titleName: HTMLElement;
  private statsEl: HTMLElement;
  private hintEl: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private overlay: HTMLElement | null = null;
  private hintTimer = 0;
  private winTimer = 0;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private probe: HTMLElement;
  private lastStats = '';

  constructor(private stage: HTMLElement, private ui: HTMLElement, public hooks: GameHooks = {}) {
    this.backdrop = new Backdrop(stage);
    this.renderer = new Renderer(stage.querySelector('canvas') as HTMLCanvasElement);
    this.loop = new Loop(() => this.session?.tick(), (alpha, ms) => this.frame(alpha, ms));

    this.probe = h('div', {
      style: {
        position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
        paddingTop: 'env(safe-area-inset-top)', paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)',
      },
    });
    document.body.appendChild(this.probe);

    this.titleEyebrow = h('span', { class: 'eyebrow' });
    this.titleName = h('span', { class: 'name' });
    this.statsEl = h('span', { class: 'hud-stats', 'aria-hidden': 'true' });
    const hud = (this.hud = h('div', { class: 'hud', 'data-ui': '' },
      h('div', { class: 'hud-title' }, this.titleEyebrow, this.titleName, this.statsEl),
      h('div', { class: 'hud-buttons' },
        h('button', { class: 'icon-btn', 'aria-label': 'Restart level (R)', title: 'Restart (R)', html: ICONS.restart, onclick: () => this.restart() }),
        h('button', { class: 'icon-btn', 'aria-label': 'Pause (Esc)', title: 'Pause (Esc)', html: ICONS.pause, onclick: () => this.hooks.onMenu?.() }),
      ),
    ));
    this.undoBtn = h('button', {
      class: 'icon-btn undo-btn', 'data-ui': '', 'aria-label': 'Undo: rewind one peg (Z)', title: 'Undo (Z)',
      html: ICONS.undo, onclick: () => this.session?.undo(),
    });
    this.hintEl = h('div', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    ui.append(hud, this.undoBtn, this.hintEl);

    this.input = new Input(stage, {
      reverse: () => this.session?.press(),
      undo: () => this.session?.undo(),
      restart: () => this.restart(),
      pause: () => this.hooks.onMenu?.(),
      gesture: () => this.hooks.gesture?.(),
    });

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      this.loop.paused = document.hidden;
      if (!document.hidden) this.loop.resetClock();
    });
    this.resize();
    this.loop.start();
  }

  resize(): void {
    const cs = getComputedStyle(this.probe);
    const w = this.stage.clientWidth;
    const hgt = this.stage.clientHeight;
    this.insets = {
      top: parseFloat(cs.paddingTop) + 72,
      right: parseFloat(cs.paddingRight),
      bottom: parseFloat(cs.paddingBottom) + 64,
      left: parseFloat(cs.paddingLeft),
    };
    this.renderer.resize(w, hgt, this.insets);
  }

  load(def: LevelDef, opts: LoadOptions): void {
    const level = compileLevel(def);
    this.level = level;
    this.palette = paletteFor(def.world);
    this.backdrop.setPalette(this.palette, opts.dusk);
    const root = document.documentElement.style;
    root.setProperty('--ink', this.palette.ink);
    root.setProperty('--ink-soft', this.palette.inkSoft);
    root.setProperty('--panel', this.palette.panel);
    document.documentElement.dataset.world = String(def.world);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.palette.sky[0][1]);
    this.titleEyebrow.textContent = opts.eyebrow;
    this.titleName.textContent = def.name;
    this.startSession();
    this.showHint(opts.quiet ? undefined : def.hint);
  }

  setHudVisible(v: boolean): void {
    this.hud.classList.toggle('hidden', !v);
    this.undoBtn.classList.toggle('hidden', !v);
    if (!v) this.showHint(undefined);
  }

  setStatsVisible(v: boolean): void {
    this.showStats = v;
    this.statsEl.hidden = !v;
  }

  /** Fade the playfield out, swap content, and fade back in. */
  transition(swap: () => void): void {
    const canvas = this.renderer.canvas;
    const quick = this.renderer.opts.reducedMotion;
    canvas.classList.add('fading');
    window.setTimeout(() => {
      swap();
      requestAnimationFrame(() => canvas.classList.remove('fading'));
    }, quick ? 60 : 280);
  }

  private startSession(): void {
    if (!this.level) return;
    clearTimeout(this.winTimer);
    const level = this.level;
    this.session = new Session(level, (e, s) => this.onEvent(e, s), { startDelayMs: 800 });
    this.renderer.setLevel(level, this.palette);
    this.resize();
    this.loop.resetClock();
    this.closeOverlay();
  }

  closeOverlay(): void {
    if (this.overlay) {
      void hideOverlay(this.overlay);
      this.overlay = null;
    }
  }

  restart(): void {
    this.startSession();
  }

  private onEvent(e: SessionEvent, s: WorldState): void {
    const level = this.level!;
    const t = s.tick;
    switch (e.type) {
      case 'pivot':
        this.renderer.onPivot(e.peg, t);
        break;
      case 'reverse':
        this.renderer.onReverse(s.pivot, t);
        break;
      case 'spark':
        this.renderer.onSpark(e.spark);
        break;
      case 'hit':
        this.renderer.onHit(e.hazard, t);
        break;
      case 'rewind-start':
        this.renderer.breakTrail();
        break;
      case 'won':
        this.renderer.onWon(e.peg, t);
        if (this.onSessionWon) this.onSessionWon();
        else this.winTimer = window.setTimeout(() => this.showWin(), 950);
        break;
    }
    this.hooks.onEvent?.(e, s, level);
  }

  private showHint(text?: string): void {
    clearTimeout(this.hintTimer);
    this.hintEl.classList.remove('show');
    if (!text) return;
    // Hints are written for touch; adapt the verb for mouse and keyboard players.
    this.hintEl.textContent = matchMedia('(pointer: fine)').matches ? text.replace(/^Tap\b/, 'Click or press Space') : text;
    this.hintTimer = window.setTimeout(() => {
      this.hintEl.classList.add('show');
      this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), 6500);
    }, 700);
  }

  private showWin(): void {
    const s = this.session;
    const level = this.level;
    if (!s || !level) return;
    const stars = starsFor(level, s.elapsedMs, s.moves);
    const totalSparks = level.def.sparks?.length ?? 0;
    const result: WinResult = { stars, timeMs: s.elapsedMs, moves: s.moves, sparks: s.state.sparks.length, totalSparks };
    const opts = this.hooks.onWin?.(result) ?? { hasNext: false };

    const starEls = [0, 1, 2].map((i) =>
      h('span', { class: `star${i < stars.total ? ' on' : ''}`, style: { transitionDelay: `${0.35 + i * 0.18}s` }, html: ICONS.star }),
    );
    const par = level.def.par;
    const overlay = h('div', { class: 'overlay', 'data-ui': '' },
      h('div', { class: 'card', role: 'dialog', 'aria-label': `Level complete, ${stars.total} of 3 stars` },
        h('div', { class: 'stars-row' }, ...starEls),
        h('h2', {}, ['Lovely', 'Nicely done', 'Beautiful'][stars.total - 1]),
        h('p', { class: 'sub' }, level.def.name),
        h('div', { class: 'stats' },
          h('div', { class: `stat${stars.time ? ' met' : ''}` },
            h('div', { class: 'v' }, formatTime(s.elapsedMs)),
            h('div', { class: 'k' }, `Time · par ${par.time}s`)),
          h('div', { class: `stat${stars.moves ? ' met' : ''}` },
            h('div', { class: 'v' }, String(s.moves)),
            h('div', { class: 'k' }, `Moves · par ${par.moves}`)),
          totalSparks > 0
            ? h('div', { class: `stat${result.sparks === totalSparks ? ' met' : ''}` },
                h('div', { class: 'v' }, `${result.sparks}/${totalSparks}`),
                h('div', { class: 'k' }, 'Sparks'))
            : null,
        ),
        h('div', { class: 'btn-row' },
          this.hooks.onLevels ? h('button', { class: 'btn ghost', 'aria-label': 'Levels', onclick: () => this.hooks.onLevels?.() }, 'Levels') : null,
          h('button', { class: `btn${opts.hasNext ? '' : ' primary'}`, onclick: () => this.restart() }, 'Replay'),
          opts.hasNext ? h('button', { class: 'btn primary', onclick: () => this.hooks.onNext?.() }, 'Next') : null,
        ),
      ),
    );
    this.ui.append(overlay);
    this.overlay = overlay;
    showOverlay(overlay);
    if (!matchMedia('(pointer: coarse)').matches) {
      (overlay.querySelector('.btn.primary') as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }

  private frame(alpha: number, ms: number): void {
    const s = this.session;
    if (!s) return;
    if (!this.loop.paused) s.frame(ms);
    this.renderer.draw(s.view(alpha), ms / 1000);
    this.undoBtn.disabled = !s.canUndo();
    if (this.showStats) {
      const text = `${formatTime(s.elapsedMs).replace(/\.\d/, '')} · ${s.moves} ${s.moves === 1 ? 'move' : 'moves'}`;
      if (text !== this.lastStats) {
        this.statsEl.textContent = text;
        this.lastStats = text;
      }
    }
  }
}
