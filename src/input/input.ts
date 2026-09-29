// Input: steer the spin with left/right (keys, or tapping either half of the
// screen), plus a few shortcuts. Steering fires on pointerdown/keydown for the
// lowest latency; touches on UI controls (anything inside [data-ui]) never
// reach the game.

export interface InputHandlers {
  /** 1 = clockwise (right), -1 = counter-clockwise (left). */
  steer(dir: 1 | -1): void;
  /** Flip the current direction (Space; kept for one-switch play). */
  reverse(): void;
  /** Touch swipe (screen vector): steer so the rod's tip heads that way. */
  swipe?(dx: number, dy: number): void;
  /** How touch steers: swipe, or tap the left/right half. */
  touchMode?(): 'swipe' | 'sides';
  undo?(): void;
  restart?(): void;
  pause?(): void;
  /**
   * Fires on gestures that browsers count as user activation (pointerup,
   * touchend, keydown). Used to unlock audio; cheap to call repeatedly.
   */
  gesture?(): void;
}

/** Finger travel (CSS px) before a drag counts as a swipe. */
const SWIPE_PX = 22;

export class Input {
  enabled = true;
  private detach: (() => void)[] = [];
  /** Active touch drag: origin of the current swipe segment. */
  private drag: { id: number; x: number; y: number } | null = null;

  constructor(stage: HTMLElement, private h: InputHandlers) {
    const onPointer = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      if (e.pointerType !== 'mouse' && this.h.touchMode?.() === 'swipe') {
        // Swipe mode: nothing happens on touch-down; the drag decides.
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }
      // Left half of the stage turns counter-clockwise, right half clockwise.
      const r = stage.getBoundingClientRect();
      if (this.enabled) this.h.steer(e.clientX - r.left < r.width / 2 ? -1 : 1);
    };
    const onKey = (e: KeyboardEvent) => {
      this.h.gesture?.();
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const onControl = target.closest('button, input, select, textarea, a');
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          if (target.closest('input, textarea, select')) return;
          e.preventDefault();
          if (this.enabled) this.h.steer(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (target.closest('input, textarea, select')) return;
          e.preventDefault();
          if (this.enabled) this.h.steer(1);
          break;
        case 'Space':
          if (onControl && !target.closest('[data-game-key]')) return;
          e.preventDefault();
          if (this.enabled) this.h.reverse();
          break;
        case 'KeyZ':
        case 'Backspace':
          if (target.closest('input, textarea')) return;
          e.preventDefault();
          if (this.enabled) this.h.undo?.();
          break;
        case 'KeyR':
          if (target.closest('input, textarea')) return;
          if (this.enabled) this.h.restart?.();
          break;
        case 'Escape':
        case 'KeyP':
          this.h.pause?.();
          break;
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      if (this.enabled) this.h.swipe?.(dx, dy);
      // Start a new segment so one drag can change its mind and reverse again.
      this.drag = { id: d.id, x: e.clientX, y: e.clientY };
    };
    const onEnd = (e: PointerEvent) => {
      if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    };
    stage.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    this.detach.push(
      () => stage.removeEventListener('pointermove', onMove),
      () => window.removeEventListener('pointerup', onEnd),
      () => window.removeEventListener('pointercancel', onEnd),
    );
    // Suppress context menu, double-tap zoom and long-press callouts on the stage.
    const block = (e: Event) => {
      if (!(e.target as HTMLElement).closest('[data-ui]')) e.preventDefault();
    };
    // Touch activation only counts on release, so audio unlocks there.
    const onActivate = () => this.h.gesture?.();
    window.addEventListener('pointerup', onActivate);
    window.addEventListener('touchend', onActivate);
    stage.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    stage.addEventListener('contextmenu', block);
    stage.addEventListener('dblclick', block);
    this.detach.push(
      () => window.removeEventListener('pointerup', onActivate),
      () => window.removeEventListener('touchend', onActivate),
      () => stage.removeEventListener('pointerdown', onPointer),
      () => window.removeEventListener('keydown', onKey),
      () => stage.removeEventListener('contextmenu', block),
      () => stage.removeEventListener('dblclick', block),
    );
  }

  dispose(): void {
    this.detach.forEach((d) => d());
  }
}
