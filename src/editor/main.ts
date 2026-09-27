// Pivotide level editor. Place and drag pegs, hazards and sparks, edit rails,
// check solvability, test-play instantly, and import/export level JSON.

import '../style.css';
import './editor.css';
import { compileLevel, degToUnits, initialState, type CompiledLevel, type Rect } from '../sim/level';
import { hazardShape, type Segment } from '../sim/step';
import type { Solution } from '../sim/solver';
import { runReplay } from '../sim/replay';
import { TICKS_PER_SEC, type HazardDef, type LevelDef, type PathDef, type PegDef, type PegKind } from '../sim/types';
import { Backdrop } from '../render/background';
import { paletteFor } from '../render/palette';
import { Renderer } from '../render/renderer';
import type { View } from '../game/session';
import { Game } from '../game/game';
import { h } from '../ui/dom';
import { dcos, dsin } from '../sim/fixed';

const shipped = import.meta.glob<LevelDef>('../../levels/w*/*.json', { eager: true, import: 'default' });
const DRAFT_KEY = 'pivotide.editor.draft';

// ---------------------------------------------------------------- state

type Sel =
  | { type: 'peg'; i: number }
  | { type: 'hazard'; i: number }
  | { type: 'spark'; i: number }
  | null;

type Handle =
  | { kind: 'wall-end'; i: number; end: 1 | 2 }
  | { kind: 'path-pt'; owner: 'peg' | 'hazard'; i: number; p: number }
  | { kind: 'circle-c'; owner: 'peg' | 'hazard'; i: number }
  | { kind: 'circle-r'; owner: 'peg' | 'hazard'; i: number }
  | { kind: 'blade-end'; i: number }
  | { kind: 'start-angle' };

type Tool = 'select' | PegKind | 'wall' | 'orb' | 'blade' | 'spark';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'select', label: 'Select', icon: '↖', key: 'V' },
  { id: 'normal', label: 'Peg', icon: '●', key: 'P' },
  { id: 'goal', label: 'Goal', icon: '◎', key: 'G' },
  { id: 'fast', label: 'Fast', icon: '»', key: 'F' },
  { id: 'slow', label: 'Slow', icon: '≈', key: 'S' },
  { id: 'reverse', label: 'Reverse', icon: '⟲', key: 'R' },
  { id: 'once', label: 'Once', icon: '◌', key: 'O' },
  { id: 'portal', label: 'Portal', icon: '◉', key: 'T' },
  { id: 'wall', label: 'Wall', icon: '▬', key: 'W' },
  { id: 'orb', label: 'Orb', icon: '✹', key: 'B' },
  { id: 'blade', label: 'Blade', icon: '✢', key: 'L' },
  { id: 'spark', label: 'Spark', icon: '✦', key: 'K' },
];

function blankLevel(): LevelDef {
  return {
    id: 'custom-01',
    name: 'Untitled Dune',
    world: 1,
    hint: '',
    start: { peg: 'p1', angle: 270, dir: 1 },
    bounds: { w: 500, h: 800 },
    pegs: [
      { id: 'p1', x: 250, y: 650 },
      { id: 'goal', x: 250, y: 250, kind: 'goal' },
    ],
    hazards: [],
    sparks: [],
    par: { time: 20, moves: 3 },
  };
}

let level: LevelDef = loadDraft() ?? blankLevel();
let tool: Tool = 'select';
let sel: Sel = null;
let snapMode: 'lattice' | 'grid' | 'off' = 'lattice';
let undoStack: string[] = [];
let redoStack: string[] = [];
let compiled: CompiledLevel | null = null;
let compileError = '';
let solveInfo = '';

// ---------------------------------------------------------------- dom

const stage = document.getElementById('ed-stage') as HTMLElement;
const canvas = document.getElementById('ed-canvas') as HTMLCanvasElement;
const panel = document.getElementById('ed-panel') as HTMLElement;
const statusEl = document.getElementById('ed-status') as HTMLElement;
const toolsEl = document.getElementById('ed-tools') as HTMLElement;
const backdrop = new Backdrop(stage);
const renderer = new Renderer(canvas);
renderer.opts.reducedMotion = false;

// View rectangle (world units) that the editor camera frames; pan/zoom edit it.
let viewRect: Rect = { x: -40, y: -40, w: 580, h: 880 };

// ---------------------------------------------------------------- helpers

function loadDraft(): LevelDef | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as LevelDef) : null;
  } catch {
    return null;
  }
}

function saveDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(level));
  } catch {
    /* draft autosave is best-effort */
  }
}

const rod = () => level.rod ?? 100;

function uid(prefix: string, taken: { id: string }[]): string {
  let n = taken.length + 1;
  while (taken.some((t) => t.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function snap(x: number, y: number, bypass: boolean): { x: number; y: number } {
  if (bypass || snapMode === 'off') return { x: r1(x), y: r1(y) };
  if (snapMode === 'grid') return { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 };
  // Triangular lattice with spacing = rod length, anchored on the start peg.
  const start = level.pegs.find((p) => p.id === level.start.peg) ?? level.pegs[0];
  const ox = start?.x ?? 0, oy = start?.y ?? 0;
  const L = rod();
  const rowH = (L * Math.sqrt(3)) / 2;
  const j = Math.round((y - oy) / rowH);
  const i = Math.round((x - ox) / L - j / 2);
  // Check neighbouring lattice points to pick the true nearest.
  let best = { x: 0, y: 0, d: Infinity };
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di;
      const px = ox + L * (ii + jj / 2), py = oy + rowH * jj;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best.d) best = { x: px, y: py, d };
    }
  }
  return { x: r1(best.x), y: r1(best.y) };
}

function commit(): void {
  undoStack.push(JSON.stringify(level));
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
}

function changed(): void {
  saveDraft();
  recompile();
  renderPanel();
}

function recompile(): void {
  try {
    compiled = compileLevel(structuredClone(level));
    compileError = '';
    backdrop.setPalette(paletteFor(level.world), 0.1 + (level.world - 1) * 0.4);
    renderer.setLevel(compiled, paletteFor(level.world));
    renderer.skipIntro();
    renderer.frameOverride = viewRect;
    resize();
  } catch (e) {
    compileError = (e as Error).message;
  }
  setStatus();
}

function solutionStatus(): string {
  if (!compiled || !level.solution) return 'no stored solution (win a test play to record one)';
  const r = runReplay(compiled, level.solution, 60 * 60 * TICKS_PER_SEC);
  return r.state.status === 'won' ? `✓ stored solution wins (${level.solution.length} reversals)` : '✗ stored solution no longer wins';
}

function setStatus(msg?: string): void {
  statusEl.classList.toggle('error', !!compileError);
  statusEl.textContent = compileError
    ? `⚠ ${compileError}`
    : msg ?? `${level.pegs.length} pegs · ${(level.hazards ?? []).length} hazards · ${(level.sparks ?? []).length} sparks · ${solutionStatus()} · snap: ${snapMode} (N)`;
}

function resize(): void {
  const w = stage.clientWidth, hh = stage.clientHeight;
  renderer.frameOverride = viewRect;
  renderer.resize(w, hh, { top: 0, right: 0, bottom: 0, left: 0 });
}

function toWorld(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return renderer.camera.toWorld(e.clientX - r.left, e.clientY - r.top);
}

// ---------------------------------------------------------------- hit testing

const seg: Segment = { x1: 0, y1: 0, x2: 0, y2: 0, r: 0 };

function distSeg(px: number, py: number, s: Segment): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
}

function pathOf(owner: 'peg' | 'hazard', i: number): PathDef | undefined {
  if (owner === 'peg') return level.pegs[i]?.path;
  const hz = level.hazards?.[i];
  return hz && hz.kind === 'orb' ? hz.path : undefined;
}

function startTip(): { x: number; y: number } | null {
  const p = level.pegs.find((pp) => pp.id === level.start.peg);
  if (!p) return null;
  const a = degToUnits(level.start.angle);
  return { x: p.x + rod() * dcos(a), y: p.y + rod() * dsin(a) };
}

function hitHandle(x: number, y: number): Handle | null {
  const tol = 9 / renderer.camera.scale;
  const near = (px: number, py: number) => Math.hypot(px - x, py - y) <= tol;
  const tip = startTip();
  if (tip && near(tip.x, tip.y)) return { kind: 'start-angle' };
  if (!sel) return null;
  if (sel.type === 'hazard') {
    const hz = level.hazards![sel.i];
    if (hz.kind === 'wall') {
      if (near(hz.x1, hz.y1)) return { kind: 'wall-end', i: sel.i, end: 1 };
      if (near(hz.x2, hz.y2)) return { kind: 'wall-end', i: sel.i, end: 2 };
    }
    if (hz.kind === 'blade') {
      const a = Math.round((hz.phase ?? 0) * 1048576);
      if (near(hz.x + (hz.length / 2) * dcos(a), hz.y + (hz.length / 2) * dsin(a))) return { kind: 'blade-end', i: sel.i };
    }
  }
  if (sel.type === 'peg' || sel.type === 'hazard') {
    const owner = sel.type;
    const p = pathOf(owner, sel.i);
    if (p?.type === 'polyline') {
      for (let k = 0; k < p.points.length; k++) if (near(p.points[k][0], p.points[k][1])) return { kind: 'path-pt', owner, i: sel.i, p: k };
    } else if (p?.type === 'circle') {
      if (near(p.cx + p.r, p.cy)) return { kind: 'circle-r', owner, i: sel.i };
      if (near(p.cx, p.cy)) return { kind: 'circle-c', owner, i: sel.i };
    }
  }
  return null;
}

function hitElement(x: number, y: number): Sel {
  const tol = 6 / renderer.camera.scale;
  for (let i = level.pegs.length - 1; i >= 0; i--) {
    const p = level.pegs[i];
    const pos = p.path ? pathStart(p.path) : p;
    if (Math.hypot(pos.x - x, pos.y - y) <= 13 + tol) return { type: 'peg', i };
  }
  const sparks = level.sparks ?? [];
  for (let i = sparks.length - 1; i >= 0; i--) if (Math.hypot(sparks[i].x - x, sparks[i].y - y) <= 11 + tol) return { type: 'spark', i };
  if (compiled) {
    for (let i = compiled.hazards.length - 1; i >= 0; i--) {
      hazardShape(compiled.hazards[i], 0, seg);
      if (distSeg(x, y, seg) <= seg.r + 4 + tol) return { type: 'hazard', i };
    }
  }
  return null;
}

function pathStart(p: PathDef): { x: number; y: number } {
  if (p.type === 'polyline') return { x: p.points[0][0], y: p.points[0][1] };
  const a = Math.round((p.phase ?? 0) * 1048576) * (p.ccw ? -1 : 1);
  return { x: p.cx + p.r * dcos(a), y: p.cy + p.r * dsin(a) };
}

// ---------------------------------------------------------------- mutations

function moveElement(s: NonNullable<Sel>, dx: number, dy: number): void {
  const shiftPath = (p?: PathDef) => {
    if (!p) return;
    if (p.type === 'polyline') p.points = p.points.map(([x, y]) => [r1(x + dx), r1(y + dy)]);
    else { p.cx = r1(p.cx + dx); p.cy = r1(p.cy + dy); }
  };
  if (s.type === 'peg') {
    const p = level.pegs[s.i];
    p.x = r1(p.x + dx); p.y = r1(p.y + dy);
    shiftPath(p.path);
  } else if (s.type === 'spark') {
    const sp = level.sparks![s.i];
    sp.x = r1(sp.x + dx); sp.y = r1(sp.y + dy);
  } else {
    const hz = level.hazards![s.i];
    if (hz.kind === 'wall') { hz.x1 = r1(hz.x1 + dx); hz.y1 = r1(hz.y1 + dy); hz.x2 = r1(hz.x2 + dx); hz.y2 = r1(hz.y2 + dy); }
    else { hz.x = r1(hz.x + dx); hz.y = r1(hz.y + dy); if (hz.kind === 'orb') shiftPath(hz.path); }
  }
}

function elementAnchor(s: NonNullable<Sel>): { x: number; y: number } {
  if (s.type === 'peg') { const p = level.pegs[s.i]; return p.path ? pathStart(p.path) : p; }
  if (s.type === 'spark') return level.sparks![s.i];
  const hz = level.hazards![s.i];
  return hz.kind === 'wall' ? { x: hz.x1, y: hz.y1 } : { x: hz.x, y: hz.y };
}

function place(t: Tool, x: number, y: number): void {
  commit();
  if (t === 'spark') {
    level.sparks = level.sparks ?? [];
    level.sparks.push({ id: uid('s', level.sparks), x, y });
    sel = { type: 'spark', i: level.sparks.length - 1 };
  } else if (t === 'orb') {
    level.hazards = level.hazards ?? [];
    level.hazards.push({ id: uid('o', level.hazards), kind: 'orb', x, y, r: 11 });
    sel = { type: 'hazard', i: level.hazards.length - 1 };
  } else if (t === 'blade') {
    level.hazards = level.hazards ?? [];
    level.hazards.push({ id: uid('b', level.hazards), kind: 'blade', x, y, length: 70, spin: 0.2, phase: 0 });
    sel = { type: 'hazard', i: level.hazards.length - 1 };
  } else if (t === 'goal') {
    const existing = level.pegs.findIndex((p) => p.kind === 'goal');
    if (existing >= 0) {
      level.pegs[existing].x = x;
      level.pegs[existing].y = y;
      sel = { type: 'peg', i: existing };
    } else {
      level.pegs.push({ id: 'goal', x, y, kind: 'goal' });
      sel = { type: 'peg', i: level.pegs.length - 1 };
    }
  } else if (t !== 'select' && t !== 'wall') {
    const peg: PegDef = { id: uid('p', level.pegs), x, y };
    if (t !== 'normal') peg.kind = t;
    if (t === 'portal') {
      // Pair with the most recent unpaired portal, if any.
      const open = level.pegs.find((p) => p.kind === 'portal' && !level.pegs.some((q) => q !== p && q.pair === p.id));
      if (open) { peg.pair = open.id; open.pair = peg.id; }
    }
    level.pegs.push(peg);
    sel = { type: 'peg', i: level.pegs.length - 1 };
  }
  changed();
}

function deleteSel(): void {
  if (!sel) return;
  commit();
  if (sel.type === 'peg') {
    const p = level.pegs[sel.i];
    if (p.id === level.start.peg) { setStatus('The start peg cannot be deleted. Set another peg as start first.'); undoStack.pop(); return; }
    level.pegs.splice(sel.i, 1);
    for (const q of level.pegs) if (q.pair === p.id) delete q.pair;
  } else if (sel.type === 'spark') level.sparks!.splice(sel.i, 1);
  else level.hazards!.splice(sel.i, 1);
  sel = null;
  changed();
}

function duplicateSel(): void {
  if (!sel) return;
  commit();
  const off = 30;
  if (sel.type === 'peg') {
    const p = structuredClone(level.pegs[sel.i]);
    p.id = uid('p', level.pegs);
    if (p.kind === 'goal') p.kind = 'normal';
    delete p.pair;
    level.pegs.push(p);
    sel = { type: 'peg', i: level.pegs.length - 1 };
  } else if (sel.type === 'spark') {
    const s = structuredClone(level.sparks![sel.i]);
    s.id = uid('s', level.sparks!);
    level.sparks!.push(s);
    sel = { type: 'spark', i: level.sparks!.length - 1 };
  } else {
    const hz = structuredClone(level.hazards![sel.i]);
    hz.id = uid(hz.kind[0], level.hazards!);
    level.hazards!.push(hz);
    sel = { type: 'hazard', i: level.hazards!.length - 1 };
  }
  moveElement(sel, off, off);
  changed();
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(JSON.stringify(level));
  level = JSON.parse(prev);
  sel = null;
  changed();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(JSON.stringify(level));
  level = JSON.parse(next);
  sel = null;
  changed();
}

// ---------------------------------------------------------------- pointer

let drag:
  | { mode: 'move'; s: NonNullable<Sel>; last: { x: number; y: number }; grab: { x: number; y: number }; committed: boolean }
  | { mode: 'handle'; h: Handle; committed: boolean }
  | { mode: 'wall'; x: number; y: number; i: number }
  | { mode: 'pan'; sx: number; sy: number; rect: Rect }
  | null = null;
let hover = { x: 0, y: 0 };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const w = toWorld(e);
  if (e.button === 1 || e.button === 2) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, rect: { ...viewRect } };
    return;
  }
  const bypass = e.altKey;
  const handle = hitHandle(w.x, w.y);
  if (handle) {
    drag = { mode: 'handle', h: handle, committed: false };
    return;
  }
  if (tool === 'select') {
    const hit = hitElement(w.x, w.y);
    sel = hit;
    if (hit) {
      const a = elementAnchor(hit);
      drag = { mode: 'move', s: hit, last: { ...a }, grab: { x: w.x - a.x, y: w.y - a.y }, committed: false };
    }
    renderPanel();
    return;
  }
  const p = snap(w.x, w.y, bypass);
  if (tool === 'wall') {
    commit();
    level.hazards = level.hazards ?? [];
    level.hazards.push({ id: uid('w', level.hazards), kind: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y, r: 6 });
    const i = level.hazards.length - 1;
    sel = { type: 'hazard', i };
    drag = { mode: 'wall', x: p.x, y: p.y, i };
    recompile();
    return;
  }
  place(tool, p.x, p.y);
});

canvas.addEventListener('pointermove', (e) => {
  const w = toWorld(e);
  hover = w;
  if (!drag) {
    canvas.style.cursor = hitHandle(w.x, w.y) ? 'grab' : tool === 'select' ? (hitElement(w.x, w.y) ? 'move' : 'default') : 'crosshair';
    return;
  }
  const bypass = e.altKey;
  if (drag.mode === 'pan') {
    const scale = renderer.camera.scale;
    viewRect = { ...drag.rect, x: drag.rect.x - (e.clientX - drag.sx) / scale, y: drag.rect.y - (e.clientY - drag.sy) / scale };
    resize();
    return;
  }
  if (drag.mode === 'move') {
    if (!drag.committed) { commit(); drag.committed = true; }
    const target = snap(w.x - drag.grab.x, w.y - drag.grab.y, bypass || drag.s.type !== 'peg');
    moveElement(drag.s, target.x - drag.last.x, target.y - drag.last.y);
    drag.last = target;
    recompile();
    return;
  }
  if (drag.mode === 'wall') {
    const p = snap(w.x, w.y, bypass || snapMode === 'lattice');
    const hz = level.hazards![drag.i] as Extract<HazardDef, { kind: 'wall' }>;
    hz.x2 = snapMode === 'lattice' && !bypass ? Math.round(p.x / 5) * 5 : p.x;
    hz.y2 = snapMode === 'lattice' && !bypass ? Math.round(p.y / 5) * 5 : p.y;
    recompile();
    return;
  }
  if (drag.mode === 'handle') {
    if (!drag.committed) { commit(); drag.committed = true; }
    const hd = drag.h;
    const free = { x: r1(w.x), y: r1(w.y) };
    if (hd.kind === 'start-angle') {
      const p = level.pegs.find((pp) => pp.id === level.start.peg)!;
      let deg = (Math.atan2(w.y - p.y, w.x - p.x) * 180) / Math.PI;
      if (!bypass) deg = Math.round(deg / 15) * 15;
      level.start.angle = (deg + 360) % 360;
    } else if (hd.kind === 'wall-end') {
      const hz = level.hazards![hd.i] as Extract<HazardDef, { kind: 'wall' }>;
      if (hd.end === 1) { hz.x1 = free.x; hz.y1 = free.y; } else { hz.x2 = free.x; hz.y2 = free.y; }
    } else if (hd.kind === 'blade-end') {
      const hz = level.hazards![hd.i] as Extract<HazardDef, { kind: 'blade' }>;
      hz.length = r1(Math.max(20, Math.hypot(w.x - hz.x, w.y - hz.y) * 2));
      let ph = Math.atan2(w.y - hz.y, w.x - hz.x) / (Math.PI * 2);
      if (!bypass) ph = Math.round(ph * 24) / 24;
      hz.phase = Math.round((((ph % 1) + 1) % 1) * 1000) / 1000;
    } else {
      const p = pathOf(hd.owner, hd.i)!;
      const pos = snap(w.x, w.y, bypass);
      if (hd.kind === 'path-pt' && p.type === 'polyline') p.points[hd.p] = [pos.x, pos.y];
      else if (hd.kind === 'circle-c' && p.type === 'circle') { p.cx = pos.x; p.cy = pos.y; }
      else if (hd.kind === 'circle-r' && p.type === 'circle') p.r = r1(Math.max(10, Math.hypot(w.x - p.cx, w.y - p.cy)));
      syncPathOwner(hd.owner, hd.i);
    }
    recompile();
  }
});

/** Keep a moving element's resting position on its path start, for readable JSON. */
function syncPathOwner(owner: 'peg' | 'hazard', i: number): void {
  const p = pathOf(owner, i);
  if (!p) return;
  const s = pathStart(p);
  if (owner === 'peg') { level.pegs[i].x = r1(s.x); level.pegs[i].y = r1(s.y); }
  else { const hz = level.hazards![i]; if (hz.kind === 'orb') { hz.x = r1(s.x); hz.y = r1(s.y); } }
}

canvas.addEventListener('pointerup', () => {
  if (drag && drag.mode !== 'pan') changed();
  drag = null;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w = toWorld(e);
  const k = Math.exp(e.deltaY * 0.0012);
  const nw = Math.min(4000, Math.max(150, viewRect.w * k));
  const f = nw / viewRect.w;
  viewRect = { x: w.x - (w.x - viewRect.x) * f, y: w.y - (w.y - viewRect.y) * f, w: nw, h: viewRect.h * f };
  resize();
}, { passive: false });

// ---------------------------------------------------------------- keyboard

window.addEventListener('keydown', (e) => {
  if (testing) {
    if (e.code === 'Escape') closeTest();
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.code === 'KeyD') { e.preventDefault(); duplicateSel(); return; }
  if (mod && e.code === 'KeyS') { e.preventDefault(); exportJson(); return; }
  if (mod) return;
  if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (e.code === 'Escape') { sel = null; setTool('select'); renderPanel(); return; }
  if (e.code === 'Enter') { openTest(); return; }
  if (e.code === 'KeyN') { snapMode = snapMode === 'lattice' ? 'grid' : snapMode === 'grid' ? 'off' : 'lattice'; setStatus(); return; }
  if (e.code === 'KeyZ' || e.code === 'Digit0') { fitView(); return; }
  if (sel && e.code.startsWith('Arrow')) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    commit();
    moveElement(sel, e.code === 'ArrowLeft' ? -d : e.code === 'ArrowRight' ? d : 0, e.code === 'ArrowUp' ? -d : e.code === 'ArrowDown' ? d : 0);
    changed();
    return;
  }
  const t = TOOLS.find((tt) => `Key${tt.key}` === e.code);
  if (t) setTool(t.id);
});

// ---------------------------------------------------------------- tools + panel

function setTool(t: Tool): void {
  tool = t;
  for (const b of Array.from(toolsEl.querySelectorAll('.ed-tool'))) b.classList.toggle('active', (b as HTMLElement).dataset.tool === t);
}

toolsEl.append(
  ...TOOLS.flatMap((t, i) => {
    const b = h('button', { class: 'ed-tool', 'data-tool': t.id, title: `${t.label} (${t.key})`, onclick: () => setTool(t.id) },
      h('span', { class: 'ic' }, t.icon), t.label, h('kbd', {}, t.key));
    return i === 0 || i === 7 ? [b, h('hr')] : [b];
  }),
);
setTool('select');

function num(label: string, value: number | undefined, set: (v: number) => void, step = 1): HTMLElement {
  const input = h('input', { type: 'number', step, value: value ?? '' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) { commit(); set(v); changed(); }
  });
  return h('div', { class: 'ed-row' }, h('label', {}, label), input);
}

function text(label: string, value: string | undefined, set: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'text', value: value ?? '' }) as HTMLInputElement;
  input.addEventListener('change', () => { commit(); set(input.value); changed(); });
  return h('div', { class: 'ed-row' }, h('label', {}, label), input);
}

function select<T extends string>(label: string, value: T, options: T[], set: (v: T) => void): HTMLElement {
  const s = h('select', {}, ...options.map((o) => h('option', { value: o, selected: o === value }, o))) as HTMLSelectElement;
  s.addEventListener('change', () => { commit(); set(s.value as T); changed(); });
  return h('div', { class: 'ed-row' }, h('label', {}, label), s);
}

function btn(label: string, onclick: () => void, cls = ''): HTMLElement {
  return h('button', { class: `ed-btn ${cls}`, onclick }, label);
}

function pathEditor(owner: 'peg' | 'hazard', i: number, get: () => PathDef | undefined, setPath: (p: PathDef | undefined) => void): HTMLElement[] {
  const p = get();
  const anchor = owner === 'peg' ? level.pegs[i] : (level.hazards![i] as { x: number; y: number });
  if (!p) {
    return [
      h('h3', {}, 'Motion'),
      btn('+ Rail (line)', () => { commit(); setPath({ type: 'polyline', points: [[anchor.x, anchor.y], [r1(anchor.x + 100), anchor.y]], period: 4, mode: 'pingpong' }); changed(); }),
      btn('+ Orbit (circle)', () => { commit(); setPath({ type: 'circle', cx: r1(anchor.x - 40), cy: anchor.y, r: 40, period: 5 }); syncPathOwner(owner, i); changed(); }),
    ];
  }
  const out: HTMLElement[] = [h('h3', {}, p.type === 'polyline' ? 'Rail' : 'Orbit')];
  out.push(num('Period (s)', p.period, (v) => (p.period = Math.max(0.5, v)), 0.5));
  out.push(num('Phase 0–1', p.phase ?? 0, (v) => { p.phase = ((v % 1) + 1) % 1; syncPathOwner(owner, i); }, 0.05));
  if (p.type === 'polyline') {
    out.push(select('Mode', (p.mode ?? 'pingpong') as 'pingpong' | 'loop', ['pingpong', 'loop'], (v) => (p.mode = v)));
    out.push(h('p', { class: 'ed-note' }, `${p.points.length} points. Drag the square handles on the canvas.`));
    out.push(btn('+ Point', () => { commit(); const last = p.points[p.points.length - 1]; p.points.push([r1(last[0] + 50), r1(last[1] - 50)]); changed(); }));
    if (p.points.length > 2) out.push(btn('− Point', () => { commit(); p.points.pop(); changed(); }));
  } else {
    out.push(select('Direction', p.ccw ? 'ccw' : 'cw', ['cw', 'ccw'], (v) => (p.ccw = v === 'ccw')));
  }
  out.push(btn('Remove motion', () => { commit(); setPath(undefined); changed(); }, 'danger'));
  return out;
}

function renderPanel(): void {
  const els: (HTMLElement | null)[] = [];
  if (sel?.type === 'peg') {
    const i = sel.i;
    const p = level.pegs[i];
    els.push(h('h3', {}, `Peg · ${p.id}`));
    els.push(text('Id', p.id, (v) => {
      const old = p.id;
      p.id = v.trim() || old;
      for (const q of level.pegs) if (q.pair === old) q.pair = p.id;
      if (level.start.peg === old) level.start.peg = p.id;
    }));
    els.push(select('Kind', (p.kind ?? 'normal') as PegKind, ['normal', 'goal', 'fast', 'slow', 'reverse', 'once', 'portal'], (v) => {
      if (v === 'normal') delete p.kind; else p.kind = v;
      if (v !== 'portal') delete p.pair;
    }));
    if (!p.path) {
      els.push(num('X', p.x, (v) => (p.x = v)));
      els.push(num('Y', p.y, (v) => (p.y = v)));
    }
    if (p.kind === 'portal') {
      const others = level.pegs.filter((q) => q.kind === 'portal' && q !== p).map((q) => q.id);
      els.push(select('Pair', p.pair ?? '', ['', ...others], (v) => {
        for (const q of level.pegs) if (q.pair === p.id) delete q.pair;
        if (v) { p.pair = v; const q = level.pegs.find((qq) => qq.id === v)!; q.pair = p.id; } else delete p.pair;
      }));
    }
    if (level.start.peg !== p.id && p.kind !== 'goal') {
      els.push(btn('Set as start', () => { commit(); level.start.peg = p.id; changed(); }));
    } else if (level.start.peg === p.id) {
      els.push(h('p', { class: 'ed-note' }, 'Start peg. Drag the rod tip on the canvas to set the start angle.'));
    }
    if (p.kind !== 'goal') els.push(...pathEditor('peg', i, () => p.path, (np) => { if (np) p.path = np; else delete p.path; }));
    els.push(btn('Delete', deleteSel, 'danger'));
  } else if (sel?.type === 'hazard') {
    const hz = level.hazards![sel.i];
    const i = sel.i;
    els.push(h('h3', {}, `${hz.kind} · ${hz.id}`));
    if (hz.kind === 'wall') {
      els.push(num('X1', hz.x1, (v) => (hz.x1 = v)), num('Y1', hz.y1, (v) => (hz.y1 = v)));
      els.push(num('X2', hz.x2, (v) => (hz.x2 = v)), num('Y2', hz.y2, (v) => (hz.y2 = v)));
      els.push(num('Thickness', hz.r ?? 6, (v) => (hz.r = Math.max(1, v)), 0.5));
    } else if (hz.kind === 'orb') {
      if (!hz.path) els.push(num('X', hz.x, (v) => (hz.x = v)), num('Y', hz.y, (v) => (hz.y = v)));
      els.push(num('Radius', hz.r ?? 12, (v) => (hz.r = Math.max(3, v)), 0.5));
      els.push(...pathEditor('hazard', i, () => hz.path, (np) => { if (np) hz.path = np; else delete hz.path; }));
    } else {
      els.push(num('X', hz.x, (v) => (hz.x = v)), num('Y', hz.y, (v) => (hz.y = v)));
      els.push(num('Length', hz.length, (v) => (hz.length = Math.max(10, v))));
      els.push(num('Spin (turn/s)', hz.spin, (v) => (hz.spin = v), 0.05));
      els.push(num('Phase 0–1', hz.phase ?? 0, (v) => (hz.phase = ((v % 1) + 1) % 1), 0.05));
      els.push(num('Thickness', hz.r ?? 5, (v) => (hz.r = Math.max(1, v)), 0.5));
    }
    els.push(btn('Delete', deleteSel, 'danger'));
  } else if (sel?.type === 'spark') {
    const sp = level.sparks![sel.i];
    els.push(h('h3', {}, `Spark · ${sp.id}`));
    els.push(num('X', sp.x, (v) => (sp.x = v)), num('Y', sp.y, (v) => (sp.y = v)));
    els.push(btn('Delete', deleteSel, 'danger'));
  }

  els.push(h('h3', {}, 'Level'));
  els.push(text('Id', level.id, (v) => (level.id = v.trim() || level.id)));
  els.push(text('Name', level.name, (v) => (level.name = v)));
  els.push(text('Hint', level.hint, (v) => { if (v.trim()) level.hint = v; else delete level.hint; }));
  els.push(select('World', String(level.world) as '1' | '2' | '3', ['1', '2', '3'], (v) => (level.world = Number(v))));
  els.push(num('Rod length', level.rod ?? 100, (v) => (level.rod = Math.max(30, v))));
  els.push(num('Speed (turn/s)', level.speed ?? 0.42, (v) => (level.speed = Math.max(0.05, v)), 0.02));
  els.push(num('Snap radius', level.snap ?? 14, (v) => (level.snap = Math.max(2, v))));
  els.push(num('Start angle°', level.start.angle, (v) => (level.start.angle = ((v % 360) + 360) % 360), 15));
  els.push(select('Start spin', level.start.dir === 1 ? 'clockwise' : 'counter-clockwise', ['clockwise', 'counter-clockwise'], (v) => (level.start.dir = v === 'clockwise' ? 1 : -1)));
  els.push(num('Par time (s)', level.par.time, (v) => (level.par.time = Math.max(1, v))));
  els.push(num('Par moves', level.par.moves, (v) => (level.par.moves = Math.max(0, Math.round(v)))));

  els.push(h('h3', {}, 'Check'));
  if (solveInfo) els.push(h('div', { class: 'ed-solve', html: solveInfo }));
  els.push(btn('Solve & suggest par', runSolve));
  els.push(h('p', { class: 'ed-note' }, 'Alt = free placement · wheel = zoom · right-drag = pan.'));
  els.push(h('p', { class: 'ed-note' },
    'Keys: V select · P/G/F/S/R/O/T pegs · W wall · B orb · L blade · K spark · N snap mode · Z fit view · ⌘Z undo · ⌘D duplicate · Del delete · Enter test.'));

  panel.replaceChildren(...els.filter((e): e is HTMLElement => !!e));
}

// ---------------------------------------------------------------- solve

let suggested: { time: number; moves: number; presses: number[] } | null = null;

let worker: Worker | null = null;

function runSolve(): void {
  if (!compiled) { solveInfo = 'Fix the level errors first.'; renderPanel(); return; }
  worker?.terminate();
  worker = new Worker(new URL('./solveWorker.ts', import.meta.url), { type: 'module' });
  solveInfo = 'Solving…';
  renderPanel();
  worker.onmessage = (e: MessageEvent<{ sol: Solution | null; all: Solution | null; sparks: number; idle: string; ms: number }>) => {
    const { sol, all, sparks, idle, ms } = e.data;
    worker?.terminate();
    worker = null;
    if (!sol) {
      solveInfo = `<b>No solution found</b> (${ms} ms). The goal may be unreachable, or the search ran out of budget.`;
      suggested = null;
    } else {
      const secs = sol.ticks / TICKS_PER_SEC;
      // Relaxed par: a little slack on moves and generous time.
      suggested = { moves: sol.moves + (sol.moves >= 3 ? 1 : 0), time: Math.ceil(secs * 1.5 + 4), presses: sol.presses };
      solveInfo =
        `Fewest reversals: <b>${sol.moves}</b> · fastest of those: <b>${secs.toFixed(1)}s</b><br>` +
        (sparks ? (all ? `All ${sparks} sparks: ${all.moves} reversals, ${(all.ticks / TICKS_PER_SEC).toFixed(1)}s<br>` : `All sparks: <b>not found</b><br>`) : '') +
        `Doing nothing: ${idle === 'won' ? '<b>wins</b> (too easy?)' : idle === 'hit' ? 'hits a hazard' : 'loops forever'}<br>` +
        `Suggested par: ${suggested.moves} moves, ${suggested.time}s ` +
        `<button class="ed-btn" id="ed-apply-par">Apply par + store solution</button><br><small>${ms} ms</small>`;
    }
    renderPanel();
    document.getElementById('ed-apply-par')?.addEventListener('click', () => {
      if (!suggested) return;
      commit();
      level.par = { time: suggested.time, moves: suggested.moves };
      level.solution = suggested.presses;
      changed();
    });
  };
  worker.postMessage(structuredClone(level));
}

// ---------------------------------------------------------------- import / export

function exportJson(): void {
  const json = JSON.stringify(level, null, 2);
  void navigator.clipboard?.writeText(json).catch(() => {});
  const blob = new Blob([json + '\n'], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${level.id}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus(`Exported ${level.id}.json (also copied to clipboard)`);
}

function loadLevel(def: LevelDef): void {
  try {
    compileLevel(structuredClone(def));
  } catch (e) {
    setStatus(`Import failed: ${(e as Error).message}`);
    return;
  }
  commit();
  level = structuredClone(def);
  sel = null;
  solveInfo = '';
  fitView();
  changed();
}

function importDialog(): void {
  const ta = h('textarea', { placeholder: 'Paste level JSON here, or choose a file…' }) as HTMLTextAreaElement;
  const modal = h('div', { class: 'ed-modal' },
    h('div', { class: 'ed-modal-card' },
      h('h3', {}, 'Import level'), ta,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        btn('Load pasted JSON', () => {
          try { loadLevel(JSON.parse(ta.value)); modal.remove(); } catch (e) { setStatus(`Import failed: ${(e as Error).message}`); }
        }, 'primary'),
        btn('Choose file…', () => { (document.getElementById('ed-file') as HTMLInputElement).click(); modal.remove(); }),
        btn('Cancel', () => modal.remove()),
      ),
    ),
  );
  document.body.append(modal);
  ta.focus();
}

(document.getElementById('ed-file') as HTMLInputElement).addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try { loadLevel(JSON.parse(await f.text())); } catch (err) { setStatus(`Import failed: ${(err as Error).message}`); }
  (e.target as HTMLInputElement).value = '';
});

const openSel = document.getElementById('ed-open') as HTMLSelectElement;
openSel.append(h('option', { value: '' }, 'Open level…'));
for (const k of Object.keys(shipped).sort()) openSel.append(h('option', { value: k }, k.replace('../../levels/', '').replace('.json', '')));
openSel.addEventListener('change', () => {
  const def = shipped[openSel.value];
  if (def) loadLevel(def);
  openSel.value = '';
});

document.getElementById('ed-new')!.addEventListener('click', () => loadLevel(blankLevel()));
document.getElementById('ed-import')!.addEventListener('click', importDialog);
document.getElementById('ed-export')!.addEventListener('click', exportJson);
document.getElementById('ed-solve')!.addEventListener('click', runSolve);

// ---------------------------------------------------------------- test play

let testing = false;
let wonRun: number[] | null = null;
let game: Game | null = null;
const testEl = document.getElementById('ed-test') as HTMLElement;

function openTest(): void {
  if (compileError) { setStatus(`Cannot test: ${compileError}`); return; }
  testing = true;
  testEl.hidden = false;
  if (!game) {
    game = new Game(document.getElementById('stage') as HTMLElement, document.getElementById('ui') as HTMLElement, {
      onMenu: () => closeTest(),
      onWin: () => {
        // Keep the winning run; it becomes the level's reference solution on return.
        wonRun = game?.session?.solution() ?? null;
        return { hasNext: false };
      },
    });
  }
  game.input.enabled = true;
  game.loop.paused = false;
  game.resize();
  wonRun = null;
  game.load(structuredClone(level), { eyebrow: 'Test play', dusk: 0.1 + (level.world - 1) * 0.4 });
}

function closeTest(): void {
  testing = false;
  testEl.hidden = true;
  if (wonRun) {
    commit();
    level.solution = wonRun;
    wonRun = null;
    changed();
    setStatus(`Saved your winning run (${level.solution.length} reversals) as the reference solution. ⌘Z to undo.`);
  }
  if (game) {
    game.input.enabled = false;
    game.loop.paused = true;
    game.closeOverlay();
  }
}

document.getElementById('ed-test-close')!.addEventListener('click', closeTest);
document.getElementById('ed-play')!.addEventListener('click', openTest);

// ---------------------------------------------------------------- render loop

function fitView(): void {
  const b = compiled ? { x: 0, y: 0, w: level.bounds.w, h: level.bounds.h } : viewRect;
  const pad = 40;
  viewRect = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  resize();
}

function drawOverlay(): void {
  const ctx = renderer.ctx;
  renderer.camera.apply(ctx, renderer.dpr);
  const px = 1 / renderer.camera.scale;
  // Level bounds (the authoring frame).
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = px;
  ctx.setLineDash([6 * px, 6 * px]);
  ctx.strokeRect(0, 0, level.bounds.w, level.bounds.h);
  ctx.restore();
  // Phone portrait guide (9:19.5) centred in the bounds.
  ctx.save();
  const gh = level.bounds.h, gw = gh * (9 / 19.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = px;
  ctx.strokeRect(level.bounds.w / 2 - gw / 2, 0, gw, gh);
  ctx.restore();
  // Lattice dots.
  if (snapMode === 'lattice') {
    const start = level.pegs.find((p) => p.id === level.start.peg) ?? level.pegs[0];
    if (start) {
      const L = rod(), rowH = (L * Math.sqrt(3)) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (let j = -12; j <= 12; j++) {
        for (let i = -12; i <= 12; i++) {
          const x = start.x + L * (i + j / 2), y = start.y + rowH * j;
          if (x < viewRect.x || x > viewRect.x + viewRect.w || y < viewRect.y || y > viewRect.y + viewRect.h) continue;
          ctx.beginPath();
          ctx.arc(x, y, 1.6 * px, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // Start angle handle.
  const tip = startTip();
  if (tip) handleDot(ctx, tip.x, tip.y, px, '#78d6e8');
  // Selection.
  if (sel) {
    ctx.strokeStyle = '#78d6e8';
    ctx.lineWidth = 2 * px;
    if (sel.type === 'peg') {
      const p = level.pegs[sel.i];
      const pos = p.path ? pathStart(p.path) : p;
      ring(ctx, pos.x, pos.y, 17);
      const path = p.path;
      if (path) pathHandles(ctx, path, px);
    } else if (sel.type === 'spark') {
      const sp = level.sparks![sel.i];
      ring(ctx, sp.x, sp.y, 14);
    } else if (compiled) {
      const hz = level.hazards![sel.i];
      hazardShape(compiled.hazards[sel.i], 0, seg);
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.lineWidth = (seg.r * 2 + 8);
      ctx.globalAlpha = 0.25;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (hz.kind === 'wall') { handleDot(ctx, hz.x1, hz.y1, px, '#fff'); handleDot(ctx, hz.x2, hz.y2, px, '#fff'); }
      if (hz.kind === 'blade') handleDot(ctx, seg.x2, seg.y2, px, '#fff');
      if (hz.kind === 'orb' && hz.path) pathHandles(ctx, hz.path, px);
    }
  }
  // Placement ghost.
  if (tool !== 'select' && !drag) {
    const g = snap(hover.x, hover.y, false);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * px;
    ring(ctx, g.x, g.y, 9);
    ctx.globalAlpha = 1;
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function handleDot(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, color: string): void {
  const s = 5 * px;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(40,20,30,0.9)';
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.rect(x - s, y - s, s * 2, s * 2);
  ctx.fill();
  ctx.stroke();
}

function pathHandles(ctx: CanvasRenderingContext2D, p: PathDef, px: number): void {
  if (p.type === 'polyline') p.points.forEach(([x, y]) => handleDot(ctx, x, y, px, '#ffe49a'));
  else {
    handleDot(ctx, p.cx, p.cy, px, '#ffe49a');
    handleDot(ctx, p.cx + p.r, p.cy, px, '#ffc0a0');
  }
}

let lastT = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (testing) return;
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (!compiled) return;
  const st = initialState(compiled);
  // Animate moving scenery slowly so paths are visible while editing.
  const t = (now / 1000) * TICKS_PER_SEC;
  const view: View = { pivot: st.pivot, angle: st.angle, t, state: st, mode: 'playing', rewind: 0, breath: 1 };
  renderer.draw(view, dt);
  drawOverlay();
}

window.addEventListener('resize', resize);
recompile();
fitView();
renderPanel();
requestAnimationFrame(frame);

