import { describe, expect, it } from 'vitest';
import { datan2, dcos, dsin, norm, TURN, wrapSigned } from '../src/sim/fixed';

describe('deterministic trig', () => {
  it('sin/cos match Math within 1e-7 over a full turn', () => {
    for (let a = -TURN; a <= 2 * TURN; a += 997) {
      const r = (a / TURN) * 2 * Math.PI;
      expect(Math.abs(dsin(a) - Math.sin(r))).toBeLessThan(1e-7);
      expect(Math.abs(dcos(a) - Math.cos(r))).toBeLessThan(1e-7);
    }
  });

  it('exact values at quadrant boundaries', () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(dsin(TURN / 4)).toBe(1);
    expect(dsin(TURN / 2)).toBeCloseTo(0, 12);
  });

  it('atan2 matches Math.atan2 to within 1 turn unit', () => {
    for (let i = 0; i < 2000; i++) {
      const y = Math.sin(i * 1.7) * 300;
      const x = Math.cos(i * 0.9) * 300;
      const expected = norm(Math.round((Math.atan2(y, x) / (2 * Math.PI)) * TURN));
      const diff = Math.abs(wrapSigned(datan2(y, x) - expected));
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  it('atan2 cardinal directions (canvas coords: +y is down, clockwise positive)', () => {
    expect(datan2(0, 1)).toBe(0);
    expect(datan2(1, 0)).toBe(TURN / 4);
    expect(datan2(0, -1)).toBe(TURN / 2);
    expect(datan2(-1, 0)).toBe((3 * TURN) / 4);
  });

  it('norm and wrapSigned', () => {
    expect(norm(-1)).toBe(TURN - 1);
    expect(norm(TURN)).toBe(0);
    expect(wrapSigned(TURN / 2 + 1)).toBe(-TURN / 2 + 1);
    expect(wrapSigned(-5)).toBe(-5);
  });
});
