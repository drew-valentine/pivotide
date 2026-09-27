// Wires a level session to the renderer, loop, input and HUD.

import { compileLevel, type CompiledLevel } from '../sim/level';
import type { LevelDef, SimEvent, WorldState } from '../sim/types';
import { Backdrop } from '../render/background';
import type { Insets } from '../render/camera';
import { paletteFor, type Palette } from '../render/palette';
import { Renderer } from '../render/renderer';
import { Input } from '../input/input';
import { h, hideOverlay, showOverlay, formatTime } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { Loop } from './loop';
import { Session } from './session';

export interface GameHooks {
  onEvent?(e: SimEvent, s: WorldState, level: CompiledLevel): void;
  onWin?(session: Session): void;
  firstGesture?(): void;
}

export class Game {
  readonly backdrop: Backdrop;
  readonly renderer: Renderer;
  readonly loop: Loop;
  readonly input: Input;
  session: Session | null = null;
  level: CompiledLevel | null = null;
  palette: Palette = paletteFor(1);
  private hud: HTMLElement;
  private titleEyebrow: HTMLElement;
  private titleName: HTMLElement;
  private hintEl: HTMLElement;
  private overlay: HTMLElement | null = null;
  private hintTimer = 0;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private probe: HTMLElement;

  constructor(private stage: HTMLElement, private ui: HTMLElement, private hooks: GameHooks = {}) {
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
    this.hud = h('div', { class: 'hud', 'data-ui': '' },
      h('div', { class: 'hud-title' }, this.titleEyebrow, this.titleName),
      h('div', { class: 'hud-buttons' },
        h('button', { class: 'icon-btn', 'aria-label': 'Restart level', html: ICONS.restart, onclick: () => this.restart() }),
      ),
    );
    this.hintEl = h('div', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    ui.append(this.hud, this.hintEl);

    this.input = new Input(stage, {
      reverse: () => this.session?.press(),
      restart: () => this.restart(),
      firstGesture: () => this.hooks.firstGesture?.(),
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
    const hudH = 64;
    this.insets = {
      top: parseFloat(cs.paddingTop) + hudH,
      right: parseFloat(cs.paddingRight),
      bottom: parseFloat(cs.paddingBottom) + 16,
      left: parseFloat(cs.paddingLeft),
    };
    this.renderer.resize(w, hgt, this.insets);
  }

  load(def: LevelDef, opts: { eyebrow: string; dusk: number }): void {
    const level = compileLevel(def);
    this.level = level;
    this.palette = paletteFor(def.world);
    this.backdrop.setPalette(this.palette, opts.dusk);
    const root = document.documentElement.style;
    root.setProperty('--ink', this.palette.ink);
    root.setProperty('--ink-soft', this.palette.inkSoft);
    root.setProperty('--panel', this.palette.panel);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.palette.sky[this.palette.sky.length - 2][1]);
    this.titleEyebrow.textContent = opts.eyebrow;
    this.titleName.textContent = def.name;
    this.renderer.setLevel(level, this.palette);
    this.resize();
    this.startSession();
    this.showHint(def.hint);
  }

  private startSession(): void {
    if (!this.level) return;
    const level = this.level;
    this.session = new Session(level, (e, s) => this.onEvent(e, s));
    this.renderer.setLevel(level, this.palette);
    this.resize();
    this.loop.resetClock();
    if (this.overlay) {
      void hideOverlay(this.overlay);
      this.overlay = null;
    }
  }

  restart(): void {
    this.startSession();
  }

  private onEvent(e: SimEvent, s: WorldState): void {
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
      case 'won':
        this.renderer.onWon(e.peg, t);
        setTimeout(() => this.showWin(), 900);
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
      this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), 6000);
    }, 700);
  }

  private showWin(): void {
    const s = this.session;
    if (!s) return;
    this.hooks.onWin?.(s);
    const overlay = h('div', { class: 'overlay', 'data-ui': '' },
      h('div', { class: 'card', role: 'dialog', 'aria-label': 'Level complete' },
        h('h2', {}, 'Level complete'),
        h('p', { class: 'sub' }, this.level?.def.name ?? ''),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('div', { class: 'v' }, formatTime(s.elapsedMs)), h('div', { class: 'k' }, 'Time')),
          h('div', { class: 'stat' }, h('div', { class: 'v' }, String(s.moves)), h('div', { class: 'k' }, 'Moves')),
        ),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => this.restart() }, 'Play again'),
        ),
      ),
    );
    this.ui.append(overlay);
    this.overlay = overlay;
    showOverlay(overlay);
    if (!matchMedia('(pointer: coarse)').matches) {
      (overlay.querySelector('.btn.primary') as HTMLElement | null)?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    }
  }

  private frame(alpha: number, ms: number): void {
    const s = this.session;
    if (!s) return;
    if (!this.loop.paused) s.addTime(ms);
    this.renderer.draw(s.view(alpha), ms / 1000);
  }
}
