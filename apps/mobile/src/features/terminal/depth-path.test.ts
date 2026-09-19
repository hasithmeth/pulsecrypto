import type { PriceLevel } from '@pulsecrypto/contracts';
import { buildDepthGeometry } from './depth-path';

const bids: PriceLevel[] = [
  [100, 1],
  [99, 2],
  [98, 1],
];
const asks: PriceLevel[] = [
  [102, 2],
  [103, 2],
  [104, 4],
];

const yValues = (path: string): number[] =>
  [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[2]));

describe('buildDepthGeometry', () => {
  it('accumulates volume outward from the spread', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);

    expect(geometry).toMatchObject({ bidVolume: 4, askVolume: 8 });
    expect(geometry?.midX).toBe(300);
  });

  it('closes each area along the baseline, bids to the left edge and asks to the right', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);

    expect(geometry?.bidPath.startsWith('M 0.0 100.0')).toBe(true);
    expect(geometry?.bidPath.endsWith('L 300.0 100.0 Z')).toBe(true);
    expect(geometry?.askPath.startsWith('M 300.0 100.0')).toBe(true);
    expect(geometry?.askPath.endsWith('L 600.0 100.0 Z')).toBe(true);
  });

  it('draws smooth curves rather than steps', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);
    expect(geometry?.askPath).toContain('C ');
  });

  it('never overshoots: the curve stays between the baseline and the deepest point', () => {
    const spiky: PriceLevel[] = [
      [102, 0.01],
      [103, 50],
      [104, 0.01],
      [105, 0.01],
    ];
    const geometry = buildDepthGeometry(bids, spiky, 600, 100);
    const ys = yValues(geometry?.askPath ?? '');

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(25 - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it('returns null when either side is empty', () => {
    expect(buildDepthGeometry([], asks, 600, 100)).toBeNull();
    expect(buildDepthGeometry(bids, [], 600, 100)).toBeNull();
  });

  it('puts the spread at the exact centre whatever the prices are', () => {
    const lopsided: PriceLevel[] = [
      [100.01, 1],
      [250, 1],
    ];
    expect(buildDepthGeometry(bids, lopsided, 600, 100)?.midX).toBe(300);
  });
});
