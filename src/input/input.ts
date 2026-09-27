// Input: one action (reverse) plus a few keyboard shortcuts.
// Reverse fires on pointerdown/keydown for the lowest latency; touches on UI
// controls (anything inside [data-ui]) never reach the game.

export interface InputHandlers {
  reverse(): void;
  undo?(): void;
  restart?(): void;
  pause?(): void;
  /**
   * Fires on gestures that browsers count as user activation (pointerup,
   * touchend, keydown). Used to unlock audio; cheap to call repeatedly.
   */
  gesture?(): void;
}

export class Input {
  enabled = true;
  private detach: (() => void)[] = [];

  constructor(stage: HTMLElement, private h: InputHandlers) {
    const onPointer = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      if (this.enabled) this.h.reverse();
    };
    const onKey = (e: KeyboardEvent) => {
      this.h.gesture?.();
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      const onControl = target.closest('button, input, select, textarea, a');
      switch (e.code) {
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
