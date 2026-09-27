import { describe, expect, it } from 'vitest';
import { capsuleHit, pointSegDist2, segCircle, segSegDist2 } from '../src/sim/geom';

describe('geometry', () => {
  it('point to segment distance', () => {
    expect(pointSegDist2(5, 5, 0, 0, 10, 0)).toBe(25);
    expect(pointSegDist2(-3, 4, 0, 0, 10, 0)).toBe(25); // clamps to endpoint A
    expect(pointSegDist2(13, 4, 0, 0, 10, 0)).toBe(25); // clamps to endpoint B
    expect(pointSegDist2(3, 4, 0, 0, 0, 0)).toBe(25); // degenerate segment
  });

  it('segment vs circle hits along the middle, not just the ends', () => {
    expect(segCircle(0, 0, 100, 0, 50, 8, 10)).toBe(true);
    expect(segCircle(0, 0, 100, 0, 50, 12, 10)).toBe(false);
    expect(segCircle(0, 0, 100, 0, 108, 0, 10)).toBe(true);
  });

  it('crossing segments have zero distance', () => {
    expect(segSegDist2(0, 0, 10, 10, 0, 10, 10, 0)).toBe(0);
  });

  it('parallel segments', () => {
    expect(segSegDist2(0, 0, 10, 0, 0, 3, 10, 3)).toBe(9);
    expect(segSegDist2(0, 0, 10, 0, 13, 4, 20, 4)).toBe(25);
  });

  it('collinear overlapping and disjoint', () => {
    expect(segSegDist2(0, 0, 10, 0, 5, 0, 15, 0)).toBe(0);
    expect(segSegDist2(0, 0, 10, 0, 12, 0, 15, 0)).toBe(4);
  });

  it('T configuration', () => {
    expect(segSegDist2(0, 0, 10, 0, 5, 2, 5, 10)).toBe(4);
  });

  it('capsules', () => {
    expect(capsuleHit(0, 0, 100, 0, 3, 50, 8, 50, 40, 5)).toBe(true);
    expect(capsuleHit(0, 0, 100, 0, 3, 50, 9, 50, 40, 5)).toBe(false);
  });
});
