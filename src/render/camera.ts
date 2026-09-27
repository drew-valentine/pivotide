// World → screen mapping. Levels are authored to fit a phone in portrait, so
// the camera normally fits the whole level. If the rod would render too small
// (very small or odd-shaped screens), it falls back to following the pivot.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export class Camera {
  scale = 1;
  ox = 0;
  oy = 0;
  follow = false;
  private fx = 0;
  private fy = 0;
  private cssW = 1;
  private cssH = 1;
  private bx = 0;
  private by = 0;
  private bw = 1;
  private bh = 1;

  /** Minimum on-screen rod length as a fraction of the viewport's short side. */
  static MIN_ROD_FRACTION = 0.1;

  fit(bounds: { x: number; y: number; w: number; h: number }, rod: number, cssW: number, cssH: number, insets: Insets): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.bx = bounds.x;
    this.by = bounds.y;
    this.bw = bounds.w;
    this.bh = bounds.h;
    const margin = Math.min(24, Math.min(cssW, cssH) * 0.03);
    const aw = cssW - insets.left - insets.right - margin * 2;
    const ah = cssH - insets.top - insets.bottom - margin * 2;
    const s = Math.max(0.05, Math.min(aw / bounds.w, ah / bounds.h));
    const minRodPx = Math.min(cssW, cssH) * Camera.MIN_ROD_FRACTION;
    if (rod * s >= minRodPx) {
      this.follow = false;
      this.scale = s;
      this.ox = insets.left + margin + (aw - bounds.w * s) / 2 - bounds.x * s;
      this.oy = insets.top + margin + (ah - bounds.h * s) / 2 - bounds.y * s;
    } else {
      this.follow = true;
      this.scale = minRodPx / rod;
    }
  }

  /** Follow mode: ease toward the pivot, clamped to level bounds. */
  track(x: number, y: number, dtSec: number, snap = false): void {
    if (!this.follow) return;
    const k = snap ? 1 : 1 - Math.exp(-dtSec * 3);
    this.fx += (x - this.fx) * k;
    this.fy += (y - this.fy) * k;
    const s = this.scale;
    const halfW = this.cssW / 2 / s;
    const halfH = this.cssH / 2 / s;
    const { bx, by, bw, bh } = this;
    const cx = bw <= halfW * 2 ? bx + bw / 2 : Math.min(bx + bw - halfW, Math.max(bx + halfW, this.fx));
    const cy = bh <= halfH * 2 ? by + bh / 2 : Math.min(by + bh - halfH, Math.max(by + halfH, this.fy));
    this.ox = this.cssW / 2 - cx * s;
    this.oy = this.cssH / 2 - cy * s;
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy);
  }
}
