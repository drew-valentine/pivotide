// Visual-only particles (sand motes and glints). Uses Math.random freely:
// nothing here feeds back into the simulation.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  glint: boolean;
  color: string;
}

export class Particles {
  private list: Particle[] = [];
  /** Hard cap keeps phones smooth. */
  budget = 160;

  burst(x: number, y: number, color: string, count: number, speed: number, spread = Math.PI * 2, dir = 0): void {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.budget) this.list.shift();
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.8);
      const max = 0.5 + Math.random() * 0.6;
      this.list.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: max,
        max,
        size: 0.9 + Math.random() * 1.8,
        glint: Math.random() < 0.22,
        color,
      });
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-dt * 3.2);
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vx *= drag;
      p.vy = p.vy * drag + 14 * dt; // a whisper of gravity: sand settles
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.list[w++] = p;
    }
    this.list.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const k = p.life / p.max;
      ctx.globalAlpha = k * k;
      ctx.fillStyle = p.color;
      if (p.glint) {
        const s = p.size * 2.2 * (0.6 + 0.4 * k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.quadraticCurveTo(p.x, p.y, p.x + s, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + s);
        ctx.quadraticCurveTo(p.x, p.y, p.x - s, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - s);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.list.length = 0;
  }
}
