// Canvas renderer for the playfield. Draws in world units through the camera.

import { dcos, dsin, TURN } from '../sim/fixed';
import { contentBounds, pegPos, type CompiledLevel, type Rect } from '../sim/level';
import { hazardShape, type Segment } from '../sim/step';
import { ROD_RADIUS, SPARK_RADIUS } from '../sim/types';
import type { View } from '../game/session';
import { Camera, type Insets } from './camera';
import type { Palette } from './palette';
import { Particles } from './particles';

export const PEG_R = 7;
const GOAL_R = 11;
const TAU = Math.PI * 2;
/** Cap the backing store at roughly 4K worth of pixels. */
const MAX_PIXELS = 3840 * 2160;

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  brk: boolean;
}

interface Pulse {
  x: number;
  y: number;
  age: number;
  max: number;
  r0: number;
  r1: number;
  color: string;
  width: number;
}

export interface RenderOptions {
  reducedMotion: boolean;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new Particles();
  dpr = 1;
  cssW = 1;
  cssH = 1;
  private trail: TrailPoint[] = [];
  private pulses: Pulse[] = [];
  private pegAlpha: number[] = [];
  private sparkAlpha: number[] = [];
  private time = 0;
  private wonAt = -1;
  private hitFlash = 0;
  private level: CompiledLevel | null = null;
  private frame: Rect = { x: 0, y: 0, w: 1, h: 1 };
  palette!: Palette;
  opts: RenderOptions = { reducedMotion: false };
  private seg: Segment = { x1: 0, y1: 0, x2: 0, y2: 0, r: 0 };
  private p = { x: 0, y: 0 };
  private q = { x: 0, y: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  setLevel(level: CompiledLevel, palette: Palette): void {
    this.level = level;
    this.frame = contentBounds(level);
    this.palette = palette;
    this.trail = [];
    this.pulses = [];
    this.particles.clear();
    this.pegAlpha = level.pegs.map(() => 1);
    this.sparkAlpha = (level.def.sparks ?? []).map(() => 1);
    this.wonAt = -1;
    this.hitFlash = 0;
  }

  resize(cssW: number, cssH: number, insets: Insets): void {
    const coarse = matchMedia('(pointer: coarse)').matches;
    let dpr = Math.min(window.devicePixelRatio || 1, coarse ? 2 : 3);
    if (cssW * cssH * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (cssW * cssH));
    this.dpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.particles.budget = coarse ? 120 : 220;
    if (this.level) this.camera.fit(this.frame, this.level.rod, cssW, cssH, insets);
  }

  /** Called on sim events so effects line up with the moment they happen. */
  onPivot(peg: number, t: number): void {
    if (!this.level) return;
    pegPos(this.level, peg, t, this.p);
    const pal = this.palette;
    this.pulses.push({ x: this.p.x, y: this.p.y, age: 0, max: 0.55, r0: PEG_R, r1: PEG_R * 3.2, color: pal.rodGlow, width: 2 });
    if (!this.opts.reducedMotion) this.particles.burst(this.p.x, this.p.y, pal.mote, 12, 70);
    this.breakTrail();
  }

  /** A quick flick on the pivot ring so every tap is acknowledged. */
  onReverse(pivot: number, t: number): void {
    if (!this.level) return;
    pegPos(this.level, pivot, t, this.p);
    this.pulses.push({ x: this.p.x, y: this.p.y, age: 0, max: 0.3, r0: PEG_R + 3, r1: PEG_R + 11, color: this.palette.rod, width: 1.6 });
  }

  onHit(hazard: number, t: number): void {
    const h = this.level?.hazards[hazard];
    if (!h) return;
    const sh = hazardShape(h, t, this.seg);
    this.hitFlash = 1;
    this.pulses.push({
      x: (sh.x1 + sh.x2) / 2, y: (sh.y1 + sh.y2) / 2, age: 0, max: 0.6,
      r0: sh.r, r1: sh.r + 26, color: this.palette.rod, width: 2,
    });
    this.breakTrail();
  }

  onSpark(index: number): void {
    const s = this.level?.def.sparks?.[index];
    if (!s) return;
    this.pulses.push({ x: s.x, y: s.y, age: 0, max: 0.5, r0: 4, r1: 20, color: this.palette.spark, width: 1.5 });
    if (!this.opts.reducedMotion) this.particles.burst(s.x, s.y, this.palette.spark, 9, 90);
  }

  onWon(peg: number, t: number): void {
    if (!this.level) return;
    pegPos(this.level, peg, t, this.p);
    this.wonAt = this.time;
    const pal = this.palette;
    this.pulses.push({ x: this.p.x, y: this.p.y, age: 0, max: 1.1, r0: GOAL_R, r1: GOAL_R * 7, color: pal.goalGlow, width: 3 });
    this.pulses.push({ x: this.p.x, y: this.p.y, age: -0.15, max: 1.0, r0: GOAL_R, r1: GOAL_R * 4.5, color: pal.goal, width: 1.5 });
    if (!this.opts.reducedMotion) {
      this.particles.burst(this.p.x, this.p.y, pal.mote, 28, 150);
      this.particles.burst(this.p.x, this.p.y, pal.goal, 14, 110);
    }
    this.breakTrail();
  }

  breakTrail(): void {
    const last = this.trail[this.trail.length - 1];
    if (last) last.brk = true;
  }

  draw(view: View, frameSec: number): void {
    const level = this.level;
    if (!level) return;
    const { ctx, palette: pal } = this;
    this.time += frameSec;
    const t = view.t;
    const s = view.state;

    pegPos(level, view.pivot, t, this.p);
    const px = this.p.x, py = this.p.y;
    this.camera.track(px, py, frameSec);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.camera.apply(ctx, this.dpr);
    const pxw = 1 / this.camera.scale; // one CSS pixel in world units

    const tipX = px + level.rod * dcos(view.angle);
    const tipY = py + level.rod * dsin(view.angle);
    const playing = s.status === 'playing';

    // Reach ring: where the free end travels. Pegs on it get a cool halo.
    if (playing) {
      ctx.save();
      ctx.strokeStyle = pal.reach;
      ctx.lineWidth = Math.max(1.4 * pxw, 1.2);
      ctx.setLineDash([0.01, 9]);
      ctx.lineCap = 'round';
      ctx.lineDashOffset = (-view.angle / TURN) * TAU * level.rod;
      ctx.beginPath();
      ctx.arc(px, py, level.rod, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Hazards (drawn under pegs).
    this.drawHazards(level, t);

    // Pegs.
    for (let i = 0; i < level.pegs.length; i++) {
      const peg = level.pegs[i];
      const consumed = s.consumed.includes(i);
      const target = consumed ? 0 : 1;
      this.pegAlpha[i] += (target - this.pegAlpha[i]) * Math.min(1, frameSec * 5);
      const alpha = this.pegAlpha[i];
      if (alpha < 0.02) continue;
      pegPos(level, i, t, this.q);
      const x = this.q.x, y = this.q.y;
      if (peg.kind === 'goal') {
        this.drawGoal(x, y);
        continue;
      }
      ctx.globalAlpha = alpha;
      if (playing && i !== view.pivot) {
        const d = Math.hypot(x - px, y - py);
        if (Math.abs(d - level.rod) <= level.snap) {
          ctx.strokeStyle = pal.rod;
          ctx.globalAlpha = alpha * 0.75;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, PEG_R + 4.5, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }
      }
      // Shadow, body, rim.
      ctx.fillStyle = pal.pegShadow;
      ctx.beginPath();
      ctx.arc(x, y + 2.2, PEG_R, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.peg;
      ctx.beginPath();
      ctx.arc(x, y, PEG_R, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = pal.pegEdge;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Sparks.
    const sparks = level.def.sparks ?? [];
    for (let k = 0; k < sparks.length; k++) {
      const got = s.sparks.includes(k);
      this.sparkAlpha[k] += ((got ? 0 : 1) - this.sparkAlpha[k]) * Math.min(1, frameSec * 6);
      if (this.sparkAlpha[k] < 0.02) continue;
      this.drawSpark(sparks[k].x, sparks[k].y, this.sparkAlpha[k], k);
    }

    // Trail of the free end.
    {
      const maxAge = this.opts.reducedMotion ? 0.12 : 0.34;
      if (playing && view.mode === 'playing') this.trail.push({ x: tipX, y: tipY, age: 0, brk: false });
      for (const tp of this.trail) tp.age += frameSec;
      while (this.trail.length && this.trail[0].age > maxAge) this.trail.shift();
      ctx.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        if (a.brk) continue;
        const k = 1 - b.age / maxAge;
        ctx.strokeStyle = pal.rodGlow;
        ctx.globalAlpha = k * 0.8;
        ctx.lineWidth = 1 + 4 * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Rod: soft glow layers, then a crisp core.
    const won = s.status === 'won';
    const wonK = won && this.wonAt >= 0 ? Math.min(1, (this.time - this.wonAt) / 0.6) : 0;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1 - wonK * 0.6;
    ctx.strokeStyle = pal.rodGlow;
    ctx.globalAlpha *= 0.35;
    ctx.lineWidth = ROD_RADIUS * 4.2;
    this.line(px, py, tipX, tipY);
    ctx.globalAlpha = (1 - wonK * 0.6) * 0.6;
    ctx.lineWidth = ROD_RADIUS * 2.4;
    this.line(px, py, tipX, tipY);
    ctx.globalAlpha = 1 - wonK * 0.6;
    ctx.strokeStyle = pal.rod;
    ctx.lineWidth = ROD_RADIUS * 1.25;
    this.hitFlash = Math.max(0, this.hitFlash - frameSec * 1.6);
    if (view.mode === 'rewind' || this.hitFlash > 0) {
      // Warm the rod while the tape rewinds: a soft "oops", never an alarm.
      ctx.strokeStyle = view.mode === 'rewind' ? '#ffe3cf' : pal.rod;
    }
    this.line(px, py, tipX, tipY);
    ctx.globalAlpha = 1;

    // Pivot ring and free-end bead.
    if (!won) {
      ctx.strokeStyle = pal.rod;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, PEG_R + 3.5, 0, TAU);
      ctx.stroke();
      // Direction hint: a small arc segment on the ring that leads the rotation.
      const a = (view.angle / TURN) * TAU;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = pal.rodGlow;
      ctx.beginPath();
      if (s.dir === 1) ctx.arc(px, py, PEG_R + 7, a + 0.35, a + 1.15);
      else ctx.arc(px, py, PEG_R + 7, a - 1.15, a - 0.35, false);
      ctx.stroke();
      ctx.fillStyle = pal.rod;
      ctx.beginPath();
      ctx.arc(tipX, tipY, ROD_RADIUS * 1.25, 0, TAU);
      ctx.fill();
      if (view.mode === 'breath') {
        // Settling ring: fills while the rod takes a breath before moving again.
        ctx.strokeStyle = pal.rod;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, PEG_R + 12, -Math.PI / 2, -Math.PI / 2 + TAU * view.breath);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Pulses and particles.
    for (const pu of this.pulses) pu.age += frameSec;
    this.pulses = this.pulses.filter((pu) => pu.age < pu.max);
    for (const pu of this.pulses) {
      if (pu.age < 0) continue;
      const k = pu.age / pu.max;
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      ctx.strokeStyle = pu.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = pu.width;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, pu.r0 + (pu.r1 - pu.r0) * e, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.particles.update(frameSec);
    this.particles.draw(ctx);
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** The goal: a small oasis. Cool water with ripples drifting outward. */
  private drawGoal(x: number, y: number): void {
    const { ctx, palette: pal } = this;
    const bloom = this.wonAt >= 0 ? Math.min(1, (this.time - this.wonAt) / 0.8) : 0;
    const R = GOAL_R * (1 + bloom * 0.3);
    const glowR = R * (3.2 + bloom * 2.5);
    const g = ctx.createRadialGradient(x, y, R * 0.5, x, y, glowR);
    g.addColorStop(0, pal.goalGlow);
    g.addColorStop(1, 'rgba(120, 220, 220, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, TAU);
    ctx.fill();
    // Ripples: three rings on a slow cycle.
    ctx.strokeStyle = pal.goal;
    ctx.lineWidth = 1.4;
    const period = 3.2;
    for (let i = 0; i < 3; i++) {
      const k = this.opts.reducedMotion ? (i + 1) / 4 : ((this.time / period + i / 3) % 1);
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.beginPath();
      ctx.arc(x, y, R + 3 + k * R * 1.9, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Water disc with a lighter inner shimmer.
    const w = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, 0, x, y, R);
    w.addColorStop(0, '#e9fffb');
    w.addColorStop(0.55, pal.goal);
    w.addColorStop(1, pal.goal);
    ctx.fillStyle = w;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.peg;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawSpark(x: number, y: number, alpha: number, k: number): void {
    const { ctx, palette: pal } = this;
    const tw = this.opts.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(this.time * 3 + k * 1.7);
    const s = SPARK_RADIUS * 0.9 * tw * (0.6 + 0.4 * alpha);
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2.2);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.spark;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s * 0.8, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s * 0.8, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawHazards(level: CompiledLevel, t: number): void {
    for (const h of level.hazards) {
      const sh = hazardShape(h, t, this.seg);
      if (h.def.kind === 'orb') {
        this.drawOrb(sh.x1, sh.y1, sh.r, t);
      } else if (h.def.kind === 'wall') {
        this.drawWall(sh);
      } else {
        this.drawBlade(sh, h.def.x, h.def.y);
      }
    }
  }

  /** Walls: rounded slab with diagonal hatching, so they read without colour. */
  private drawWall(sh: Segment): void {
    const { ctx, palette: pal } = this;
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.hazardEdge;
    ctx.lineWidth = sh.r * 2 + 2;
    this.line(sh.x1, sh.y1, sh.x2, sh.y2);
    ctx.strokeStyle = pal.hazard;
    ctx.lineWidth = sh.r * 2;
    this.line(sh.x1, sh.y1, sh.x2, sh.y2);
    // Hatching.
    const dx = sh.x2 - sh.x1, dy = sh.y2 - sh.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.hazardEdge;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.3;
    const step = 7;
    const hr = sh.r * 0.62;
    for (let d = step / 2; d < len; d += step) {
      const cx = sh.x1 + ux * d, cy = sh.y1 + uy * d;
      ctx.moveTo(cx - nx * hr - ux * hr * 0.6, cy - ny * hr - uy * hr * 0.6);
      ctx.lineTo(cx + nx * hr + ux * hr * 0.6, cy + ny * hr + uy * hr * 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Orbs: spiked circle. */
  private drawOrb(x: number, y: number, r: number, t: number): void {
    const { ctx, palette: pal } = this;
    const spikes = 10;
    const rot = this.opts.reducedMotion ? 0 : t / 120 * 0.6;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r : r * 0.74;
      const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fillStyle = pal.hazard;
    ctx.fill();
    ctx.strokeStyle = pal.hazardEdge;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = pal.hazardEdge;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, TAU);
    ctx.fill();
  }

  /** Blades: serrated bar on a hub. */
  private drawBlade(sh: Segment, cx: number, cy: number): void {
    const { ctx, palette: pal } = this;
    const dx = sh.x2 - sh.x1, dy = sh.y2 - sh.y1;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const teeth = Math.max(4, Math.round(len / 9));
    ctx.beginPath();
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      for (let i = 0; i <= teeth; i++) {
        const k = side === 0 ? i / teeth : 1 - i / teeth;
        const bx = sh.x1 + dx * k, by = sh.y1 + dy * k;
        const w = i % 2 === 0 ? sh.r * 1.25 : sh.r * 0.7;
        const x = bx + nx * w * sgn, y = by + ny * w * sgn;
        if (side === 0 && i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = pal.hazard;
    ctx.fill();
    ctx.strokeStyle = pal.hazardEdge;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Hub.
    ctx.beginPath();
    ctx.arc(cx, cy, sh.r * 1.5, 0, TAU);
    ctx.fillStyle = pal.hazardEdge;
    ctx.fill();
  }
}
