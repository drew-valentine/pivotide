// Desert-sunset palettes, one per world (times of evening).
// Warm skies and dunes; the rod and active pivot stay cool so they read clearly.

export interface Palette {
  name: string;
  /** Sky gradient stops from top to horizon. */
  sky: [number, string][];
  sun: string;
  sunGlow: string;
  /** Dune silhouettes, far to near. */
  dunes: string[];
  /** Cloud streak opacity. */
  cloud: number;
  stars: number; // star count (0 = none)
  rod: string;
  rodGlow: string;
  peg: string;
  pegEdge: string;
  pegShadow: string;
  reach: string;
  goal: string;
  goalGlow: string;
  spark: string;
  hazard: string;
  hazardEdge: string;
  mote: string;
  ink: string;
  inkSoft: string;
  panel: string;
}

export const PALETTES: Palette[] = [
  {
    name: 'Golden Hour',
    sky: [
      [0, '#f6e7cf'],
      [0.45, '#f7cfa0'],
      [0.75, '#f3a878'],
      [1, '#ee8a68'],
    ],
    sun: '#fff1d6',
    sunGlow: 'rgba(255, 214, 150, 0.55)',
    dunes: ['#e79b77', '#d98264', '#c56a56', '#a9564d'],
    cloud: 0.5,
    stars: 0,
    rod: '#e6fbff',
    rodGlow: 'rgba(120, 214, 232, 0.55)',
    peg: '#fff8ec',
    pegEdge: '#8a5448',
    pegShadow: 'rgba(122, 64, 52, 0.22)',
    reach: 'rgba(80, 160, 185, 0.55)',
    goal: '#8fdcd6',
    goalGlow: 'rgba(90, 200, 205, 0.45)',
    spark: '#ffffff',
    hazard: '#4b2a3b',
    hazardEdge: '#2e1826',
    mote: 'rgba(255, 244, 214, 0.95)',
    ink: '#4a2a2e',
    inkSoft: 'rgba(74, 42, 46, 0.62)',
    panel: 'rgba(255, 248, 236, 0.72)',
  },
  {
    name: 'Afterglow',
    sky: [
      [0, '#8e86bd'],
      [0.4, '#c393b6'],
      [0.72, '#eaa8a8'],
      [1, '#f6c29c'],
    ],
    sun: '#ffe7d4',
    sunGlow: 'rgba(255, 190, 170, 0.5)',
    dunes: ['#b88aa6', '#9b7497', '#7f5f89', '#634b74'],
    cloud: 0.32,
    stars: 8,
    rod: '#eafff6',
    rodGlow: 'rgba(140, 236, 200, 0.55)',
    peg: '#fff4f0',
    pegEdge: '#5d3f66',
    pegShadow: 'rgba(60, 36, 72, 0.25)',
    reach: 'rgba(150, 240, 210, 0.42)',
    goal: '#9fe8d4',
    goalGlow: 'rgba(120, 230, 200, 0.45)',
    spark: '#ffffff',
    hazard: '#352346',
    hazardEdge: '#1f1330',
    mote: 'rgba(255, 236, 240, 0.95)',
    ink: '#3a2744',
    inkSoft: 'rgba(58, 39, 68, 0.64)',
    panel: 'rgba(255, 244, 246, 0.7)',
  },
  {
    name: 'Blue Hour',
    sky: [
      [0, '#16213f'],
      [0.45, '#233f68'],
      [0.8, '#3f7189'],
      [0.94, '#7ba3a6'],
      [1, '#d6a08f'],
    ],
    sun: '#ffd9b8',
    sunGlow: 'rgba(255, 170, 140, 0.35)',
    dunes: ['#2d4a69', '#243d58', '#1b3047', '#132236'],
    cloud: 0.1,
    stars: 42,
    rod: '#f3f7ff',
    rodGlow: 'rgba(160, 196, 255, 0.6)',
    peg: '#f2ece2',
    pegEdge: '#0f1a2e',
    pegShadow: 'rgba(0, 0, 0, 0.3)',
    reach: 'rgba(180, 210, 255, 0.34)',
    goal: '#8fe0e8',
    goalGlow: 'rgba(120, 210, 240, 0.5)',
    spark: '#ffffff',
    hazard: '#0c1224',
    hazardEdge: '#9fb4d8',
    mote: 'rgba(220, 234, 255, 0.95)',
    ink: '#eef2fb',
    inkSoft: 'rgba(238, 242, 251, 0.66)',
    panel: 'rgba(22, 33, 63, 0.66)',
  },
];

export function paletteFor(world: number): Palette {
  return PALETTES[Math.max(0, Math.min(PALETTES.length - 1, world - 1))];
}
