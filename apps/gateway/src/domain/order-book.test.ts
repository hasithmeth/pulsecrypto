import type { PriceLevel } from '@pulsecrypto/contracts';
import { describe, expect, it } from 'vitest';
import { computeBookMetrics } from './order-book';

describe('computeBookMetrics', () => {
  it('derives spread from the best bid and ask without floating point noise', () => {
    const bids: PriceLevel[] = [[109235.21, 1]];
    const asks: PriceLevel[] = [[109235.62, 1]];

    const metrics = computeBookMetrics(bids, asks, 2);

    expect(metrics.spread).toBe(0.41);
    expect(metrics.spreadPct).toBeCloseTo(0.000375, 6);
  });

  it('expresses pressure as the share of resting quantity per side', () => {
    const bids: PriceLevel[] = [
      [100, 3],
      [99, 3.3],
    ];
    const asks: PriceLevel[] = [[101, 3.7]];

    const { buyPressure, sellPressure } = computeBookMetrics(bids, asks, 2);

    expect(buyPressure).toBe(63);
    expect(sellPressure).toBe(37);
  });

  it('always reports pressures that sum to 100', () => {
    const { buyPressure, sellPressure } = computeBookMetrics([[100, 1]], [[101, 2]], 2);
    expect(buyPressure + sellPressure).toBe(100);
  });

  it('stays neutral for an empty or one-sided book', () => {
    expect(computeBookMetrics([], [], 2)).toEqual({
      spread: 0,
      spreadPct: 0,
      buyPressure: 50,
      sellPressure: 50,
    });
    expect(computeBookMetrics([[100, 1]], [], 2).spread).toBe(0);
  });
});
