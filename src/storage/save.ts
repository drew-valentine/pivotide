// Progress and settings, persisted to localStorage. Every access is guarded:
// storage can be unavailable (private mode, blocked site data), and the game
// must keep working with in-memory defaults.

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  /** 'system' follows prefers-reduced-motion. */
  reducedMotion: 'system' | 'on' | 'off';
  haptics: boolean;
  showStats: boolean;
  /** Touch steering: swipe the way the rod should go, or tap the left/right half. */
  touchSteer: 'swipe' | 'sides';
}

export interface LevelRecord {
  stars: number;
  bestTimeMs: number;
  bestMoves: number;
  sparks: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  levels: Record<string, LevelRecord>;
  /** Last level played, for "Continue". */
  last?: string;
}

const KEY = 'pivotide.save.v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.55,
  sfx: 0.8,
  muted: false,
  reducedMotion: 'system',
  haptics: true,
  showStats: true,
  touchSteer: 'swipe',
};

function fresh(): SaveData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, levels: {} };
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (parsed && parsed.version === 1) {
          this.data = {
            version: 1,
            settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
            levels: parsed.levels ?? {},
            last: parsed.last,
          };
        }
      }
    } catch {
      /* unreadable or blocked storage: play with defaults */
    }
  }

  private write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: progress lives for this session only */
    }
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.write();
  }

  record(id: string): LevelRecord | undefined {
    return this.data.levels[id];
  }

  /** Merge a finished run into the best record. Returns true if anything improved. */
  complete(id: string, run: LevelRecord): boolean {
    const prev = this.data.levels[id];
    const next: LevelRecord = prev
      ? {
          stars: Math.max(prev.stars, run.stars),
          bestTimeMs: Math.min(prev.bestTimeMs, run.bestTimeMs),
          bestMoves: Math.min(prev.bestMoves, run.bestMoves),
          sparks: Math.max(prev.sparks, run.sparks),
        }
      : run;
    const improved = !prev || JSON.stringify(prev) !== JSON.stringify(next);
    this.data.levels[id] = next;
    this.write();
    return improved;
  }

  setLast(id: string): void {
    this.data.last = id;
    this.write();
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = { ...fresh(), settings };
    this.write();
  }
}
