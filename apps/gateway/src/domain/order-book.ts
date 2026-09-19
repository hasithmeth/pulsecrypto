import type { PriceLevel } from '@pulsecrypto/contracts';

export interface BookSnapshot {
  readonly lastUpdateId: number;
  readonly receivedAt: number;
  /** Best (highest) bid first. */
  readonly bids: readonly PriceLevel[];
  /** Best (lowest) ask first. */
  readonly asks: readonly PriceLevel[];
}

export interface BookMetrics {
  readonly spread: number;
  readonly spreadPct: number;
  readonly buyPressure: number;
  readonly sellPressure: number;
}

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const totalQuantity = (levels: readonly PriceLevel[]): number =>
  levels.reduce((sum, [, quantity]) => sum + quantity, 0);

/**
 * Pressure is the share of resting quantity on each side of the visible book
 * (order book imbalance), expressed as percentages that always sum to 100.
 */
export function computeBookMetrics(
  bids: readonly PriceLevel[],
  asks: readonly PriceLevel[],
  priceDecimals: number,
): BookMetrics {
  const bestBid = bids[0]?.[0];
  const bestAsk = asks[0]?.[0];
  const hasBothSides = bestBid !== undefined && bestAsk !== undefined;

  const spread = hasBothSides ? roundTo(bestAsk - bestBid, priceDecimals) : 0;
  const mid = hasBothSides ? (bestAsk + bestBid) / 2 : 0;
  const spreadPct = mid > 0 ? roundTo((spread / mid) * 100, 6) : 0;

  const bidQuantity = totalQuantity(bids);
  const askQuantity = totalQuantity(asks);
  const resting = bidQuantity + askQuantity;
  const buyPressure = resting > 0 ? roundTo((bidQuantity / resting) * 100, 1) : 50;

  return {
    spread,
    spreadPct,
    buyPressure,
    sellPressure: roundTo(100 - buyPressure, 1),
  };
}
