import { describe, expect, it } from 'vitest';
import { commonTick, normaliseInterval } from './intervals';

describe('normaliseInterval', () => {
  it('clamps to the permitted range', () => {
    expect(normaliseInterval(1, 10, 1_000)).toBe(10);
    expect(normaliseInterval(5_000, 10, 1_000)).toBe(1_000);
  });

  it('snaps to the 10 ms grid', () => {
    expect(normaliseInterval(137, 10, 1_000)).toBe(140);
    expect(normaliseInterval(254, 10, 1_000)).toBe(250);
  });
});

describe('commonTick', () => {
  it('is undefined without clients so the timer can stop', () => {
    expect(commonTick([])).toBeUndefined();
  });

  it('is the greatest common divisor, so every client is served exactly on time', () => {
    expect(commonTick([100])).toBe(100);
    expect(commonTick([100, 250])).toBe(50);
    expect(commonTick([100, 250, 140])).toBe(10);
  });
});
