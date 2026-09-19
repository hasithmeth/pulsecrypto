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

describe('buildDepthGeometry', () => {
  it('accumulates volume outward from the spread', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);

    expect(geometry).toMatchObject({ bidVolume: 4, askVolume: 8 });
    expect(geometry?.midX).toBeCloseTo(300, 5);
  });

  it('anchors bids to the left edge and asks to the right edge of the chart', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);

    expect(geometry?.bidPath.startsWith('M 200.0 100.0')).toBe(true);
    expect(geometry?.bidPath.endsWith('L 0.0 100.0 Z')).toBe(true);
    expect(geometry?.askPath.startsWith('M 400.0 100.0')).toBe(true);
    expect(geometry?.askPath.endsWith('L 600.0 100.0 Z')).toBe(true);
  });

  it('scales the deeper side to the chart height minus headroom', () => {
    const geometry = buildDepthGeometry(bids, asks, 600, 100);
    expect(geometry?.askPath).toContain('L 600.0 10.0');
  });

  it('returns null when either side is empty or prices do not span a range', () => {
    expect(buildDepthGeometry([], asks, 600, 100)).toBeNull();
    expect(buildDepthGeometry(bids, [], 600, 100)).toBeNull();
    expect(buildDepthGeometry([[100, 1]], [[100, 1]], 600, 100)).toBeNull();
  });
});
