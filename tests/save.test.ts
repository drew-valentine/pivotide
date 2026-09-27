import { beforeEach, describe, expect, it } from 'vitest';
import { Save } from '../src/storage/save';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe('save', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
  });

  it('keeps best records across runs', () => {
    const s = new Save();
    s.complete('w1-01', { stars: 2, bestTimeMs: 9000, bestMoves: 4, sparks: 1 });
    s.complete('w1-01', { stars: 1, bestTimeMs: 7000, bestMoves: 6, sparks: 0 });
    expect(new Save().record('w1-01')).toEqual({ stars: 2, bestTimeMs: 7000, bestMoves: 4, sparks: 1 });
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('pivotide.save.v1', '{nope');
    expect(new Save().settings.master).toBeGreaterThan(0);
  });

  it('survives storage that throws', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    const s = new Save();
    expect(() => s.updateSettings({ muted: true })).not.toThrow();
    expect(s.settings.muted).toBe(true);
  });
});
