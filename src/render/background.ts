// The desert backdrop: sky gradient, sun, stars, clouds and dune silhouettes.
// Built as DOM + inline SVG so the compositor handles drift and colour
// transitions cheaply, and it stays crisp at any pixel density.

import type { Palette } from './palette';

const SVG = 'http://www.w3.org/2000/svg';
const TILE = 1200; // dune tile width in SVG units; layers repeat seamlessly

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Small seeded PRNG so the backdrop looks the same every visit. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A periodic dune ridge over [0, TILE*2] built from whole-cycle sines. */
function dunePath(seed: number, base: number, amp: number, height: number): string {
  const r = rng(seed);
  const waves = [1, 2, 3, 5].map((k) => ({ k, a: amp * (0.5 + r()) / k ** 0.6, p: r() * Math.PI * 2 }));
  const pts: string[] = [];
  const W = TILE * 2;
  for (let x = 0; x <= W; x += 10) {
    let y = base;
    for (const w of waves) y -= w.a * Math.sin((x / TILE) * Math.PI * 2 * w.k + w.p);
    // Sharpen crests a little so ridges read as dunes rather than hills.
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,${height} L${pts.join(' L')} L${W},${height} Z`;
}

export class Backdrop {
  readonly root: HTMLDivElement;
  private skyLayers: HTMLDivElement[] = [];
  private sun: HTMLDivElement;
  private starsSvg: SVGSVGElement;
  private duneSvgs: SVGSVGElement[] = [];
  private dunePaths: SVGPathElement[] = [];
  private cloudG: SVGGElement;
  private current: Palette | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'backdrop';
    parent.prepend(this.root);

    this.starsSvg = el('svg', { class: 'stars', viewBox: '0 0 1000 600', preserveAspectRatio: 'xMidYMid slice' });
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      const c = el('circle', {
        cx: (r() * 1000).toFixed(1),
        cy: (r() * r() * 420).toFixed(1),
        r: (0.45 + r() * r() * 1.1).toFixed(2),
        fill: '#fff',
      });
      c.style.animationDelay = `${(-r() * 6).toFixed(2)}s`;
      c.style.animationDuration = `${(3 + r() * 4).toFixed(2)}s`;
      c.dataset.rank = String(i);
      this.starsSvg.appendChild(c);
    }
    this.root.appendChild(this.starsSvg);

    // Clouds: thin streaks that fade out at both ends, in small staggered groups.
    const clouds = el('svg', { class: 'clouds', viewBox: `0 0 ${TILE * 2} 600`, preserveAspectRatio: 'none' });
    const defs = el('defs', {});
    const grad = el('linearGradient', { id: 'cloud-fade', x1: 0, x2: 1, y1: 0, y2: 0 });
    grad.append(
      el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
      el('stop', { offset: 0.3, 'stop-color': '#fff', 'stop-opacity': 1 }),
      el('stop', { offset: 0.75, 'stop-color': '#fff', 'stop-opacity': 1 }),
      el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }),
    );
    defs.appendChild(grad);
    clouds.appendChild(defs);
    this.cloudG = el('g', { fill: 'url(#cloud-fade)' });
    const rc = rng(11);
    for (let i = 0; i < 4; i++) {
      const y = 70 + rc() * 240;
      const x = rc() * TILE;
      const lines = 2 + Math.floor(rc() * 2);
      for (let j = 0; j < lines; j++) {
        const w = 140 + rc() * 220;
        const lx = x + (rc() - 0.5) * 120;
        const ly = y + j * (9 + rc() * 6);
        const hgt = 1.6 + rc() * 1.8;
        for (const off of [0, TILE]) {
          this.cloudG.appendChild(el('rect', { x: lx + off, y: ly, width: w, height: hgt, rx: hgt / 2 }));
        }
      }
    }
    clouds.appendChild(this.cloudG);
    this.root.appendChild(clouds);

    this.sun = document.createElement('div');
    this.sun.className = 'sun';
    this.root.appendChild(this.sun);

    const layers = [
      { base: 430, amp: 26, speed: 420 },
      { base: 470, amp: 30, speed: 300 },
      { base: 515, amp: 24, speed: 210 },
      { base: 560, amp: 20, speed: 150 },
    ];
    layers.forEach((l, i) => {
      const svg = el('svg', { class: 'dune', viewBox: `0 0 ${TILE * 2} 600`, preserveAspectRatio: 'none' });
      svg.style.animationDuration = `${l.speed}s`;
      const path = el('path', { d: dunePath(101 + i * 17, l.base, l.amp, 600) });
      svg.appendChild(path);
      this.root.appendChild(svg);
      this.duneSvgs.push(svg);
      this.dunePaths.push(path);
    });
  }

  /**
   * Apply a world palette. `progress` (0..1) is progress through that world:
   * the sun sinks level by level through the evening worlds, the moon climbs
   * through the night, and the sun rises again at dawn.
   */
  setPalette(p: Palette, progress: number): void {
    if (!this.current) {
      // First paint: apply colours instantly rather than fading in from defaults.
      this.root.classList.add('instant');
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('instant')));
    }
    if (this.current !== p) {
      const layer = document.createElement('div');
      layer.className = 'sky';
      layer.style.background = `linear-gradient(180deg, ${p.sky.map(([o, c]) => `${c} ${(o * 100).toFixed(1)}%`).join(', ')})`;
      this.root.prepend(layer);
      const old = this.skyLayers;
      this.skyLayers = [layer];
      if (old.length) {
        layer.style.opacity = '0';
        requestAnimationFrame(() => {
          layer.style.opacity = '1';
          setTimeout(() => old.forEach((o) => o.remove()), 1400);
        });
      }
      this.dunePaths.forEach((path, i) => (path.style.fill = p.dunes[i]));
      this.cloudG.style.opacity = String(p.cloud);
      for (const c of Array.from(this.starsSvg.children) as SVGElement[]) {
        c.style.opacity = Number(c.dataset.rank) < p.stars ? '' : '0';
      }
      this.root.style.setProperty('--sun', p.sun);
      this.root.style.setProperty('--sun-glow', p.sunGlow);
      this.current = p;
    }
    const t = Math.min(1, Math.max(0, progress));
    const y = p.sunPath[0] + (p.sunPath[1] - p.sunPath[0]) * t;
    const stars = p.starAlpha[0] + (p.starAlpha[1] - p.starAlpha[0]) * t;
    this.sun.classList.toggle('moon', p.celestial === 'moon');
    this.root.style.setProperty('--sun-y', `${y.toFixed(1)}%`);
    this.root.style.setProperty('--star-alpha', stars.toFixed(2));
  }
}
