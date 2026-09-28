// Desert-sunset palettes, one per world (times of evening).
// Warm skies and dunes; the rod and active pivot stay cool so they read clearly.

export interface Palette {
  name: string;
  /** Sky gradient stops from top to horizon. */
  sky: [number, string][];
  sun: string;
  sunGlow: string;
  /** Sun or crescent moon. */
  celestial: 'sun' | 'moon';
  /** Vertical position (% of screen) at the first and last level of the world. */
  sunPath: [number, number];
  /** Star layer opacity at the first and last level of the world. */
  starAlpha: [number, number];
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
  /** Dotted rails and orbits for moving pieces. */
  rail: string;
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
    celestial: 'sun',
    sunPath: [70, 77],
    dunes: ['#e79b77', '#d98264', '#c56a56', '#a9564d'],
    cloud: 0.5,
    stars: 0,
    starAlpha: [0, 0],
    rod: '#e6fbff',
    rodGlow: 'rgba(120, 214, 232, 0.55)',
    peg: '#fff8ec',
    pegEdge: '#8a5448',
    pegShadow: 'rgba(122, 64, 52, 0.22)',
    reach: 'rgba(80, 160, 185, 0.55)',
    rail: 'rgba(138, 84, 72, 0.4)',
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
    celestial: 'sun',
    sunPath: [77.5, 84.5],
    dunes: ['#b88aa6', '#9b7497', '#7f5f89', '#634b74'],
    cloud: 0.32,
    stars: 8,
    starAlpha: [0.2, 0.5],
    rod: '#eafff6',
    rodGlow: 'rgba(140, 236, 200, 0.55)',
    peg: '#fff4f0',
    pegEdge: '#5d3f66',
    pegShadow: 'rgba(60, 36, 72, 0.25)',
    reach: 'rgba(150, 240, 210, 0.42)',
    rail: 'rgba(93, 63, 102, 0.42)',
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
    celestial: 'sun',
    sunPath: [85, 92],
    dunes: ['#2d4a69', '#243d58', '#1b3047', '#132236'],
    cloud: 0.1,
    stars: 42,
    starAlpha: [0.55, 1],
    rod: '#f3f7ff',
    rodGlow: 'rgba(160, 196, 255, 0.6)',
    peg: '#f2ece2',
    pegEdge: '#0f1a2e',
    pegShadow: 'rgba(0, 0, 0, 0.3)',
    reach: 'rgba(180, 210, 255, 0.34)',
    rail: 'rgba(200, 222, 255, 0.4)',
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
  {
    name: 'Moonrise',
    sky: [
      [0, '#0b1026'],
      [0.5, '#171e44'],
      [0.84, '#28305d'],
      [1, '#434878'],
    ],
    sun: '#eef0ff',
    sunGlow: 'rgba(196, 206, 255, 0.28)',
    celestial: 'moon',
    sunPath: [30, 14],
    dunes: ['#2a2f58', '#222748', '#1a1e39', '#11142a'],
    cloud: 0.08,
    stars: 70,
    starAlpha: [1, 1],
    rod: '#f4f1ff',
    rodGlow: 'rgba(190, 180, 255, 0.6)',
    peg: '#efeaf7',
    pegEdge: '#0d1024',
    pegShadow: 'rgba(0, 0, 0, 0.35)',
    reach: 'rgba(200, 190, 255, 0.34)',
    rail: 'rgba(210, 205, 255, 0.42)',
    goal: '#9ff0e0',
    goalGlow: 'rgba(130, 240, 220, 0.5)',
    spark: '#ffffff',
    hazard: '#0a0c1c',
    hazardEdge: '#b9b4e8',
    mote: 'rgba(230, 225, 255, 0.95)',
    ink: '#f1efff',
    inkSoft: 'rgba(241, 239, 255, 0.66)',
    panel: 'rgba(20, 24, 52, 0.66)',
  },
  {
    name: 'First Dawn',
    sky: [
      [0, '#7483b8'],
      [0.35, '#b59bc2'],
      [0.66, '#f0b8a6'],
      [0.9, '#ffd6a0'],
      [1, '#ffe7b6'],
    ],
    sun: '#fff6dc',
    sunGlow: 'rgba(255, 216, 150, 0.6)',
    celestial: 'sun',
    sunPath: [95, 66],
    dunes: ['#c99aa0', '#ae7f90', '#8d6481', '#6c4c6d'],
    cloud: 0.45,
    stars: 10,
    starAlpha: [0.55, 0],
    rod: '#e6fbff',
    rodGlow: 'rgba(120, 214, 232, 0.55)',
    peg: '#fff8f0',
    pegEdge: '#5b3a57',
    pegShadow: 'rgba(70, 40, 60, 0.25)',
    reach: 'rgba(90, 170, 200, 0.5)',
    rail: 'rgba(91, 58, 87, 0.42)',
    goal: '#8fdcd6',
    goalGlow: 'rgba(90, 200, 205, 0.45)',
    spark: '#ffffff',
    hazard: '#3f2440',
    hazardEdge: '#24122a',
    mote: 'rgba(255, 240, 220, 0.95)',
    ink: '#3d2440',
    inkSoft: 'rgba(61, 36, 64, 0.64)',
    panel: 'rgba(255, 246, 240, 0.7)',
  },
];

export function paletteFor(world: number): Palette {
  return PALETTES[Math.max(0, Math.min(PALETTES.length - 1, world - 1))];
}
