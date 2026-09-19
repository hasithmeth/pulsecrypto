import type { PriceLevel } from '@pulsecrypto/contracts';

export interface DepthGeometry {
  readonly bidPath: string;
  readonly askPath: string;
  readonly midX: number;
  readonly bidVolume: number;
  readonly askVolume: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const HEADROOM = 0.75;

function cumulative(levels: readonly PriceLevel[]): number[] {
  let volume = 0;
  return levels.map(([, quantity]) => (volume += quantity));
}

const format = ({ x, y }: Point): string => `${x.toFixed(1)} ${y.toFixed(1)}`;

function pairwise<T>(items: readonly T[]): [T, T][] {
  const pairs: [T, T][] = [];
  let previous: T | undefined;
  for (const item of items) {
    if (previous !== undefined) pairs.push([previous, item]);
    previous = item;
  }
  return pairs;
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson). Cumulative depth never
 * decreases away from the spread, and unlike a plain spline this curve cannot
 * overshoot between points, so the smoothed line never implies volume that is
 * not in the book. Expects points in ascending x.
 */
function smoothCurve(points: readonly Point[]): string {
  const segments = pairwise(points);
  const slopes = segments.map(([a, b]) => (b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x)));

  const tangents = points.map((_, index) => {
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before === undefined) return after ?? 0;
    if (after === undefined) return before;
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });

  return segments
    .map(([a, b], index) => {
      const third = (b.x - a.x) / 3;
      const control1 = { x: a.x + third, y: a.y + (tangents[index] ?? 0) * third };
      const control2 = { x: b.x - third, y: b.y - (tangents[index + 1] ?? 0) * third };
      return `C ${format(control1)} ${format(control2)} ${format(b)}`;
    })
    .join(' ');
}

/**
 * Builds the two cumulative-depth areas. Both sides are ordered best price
 * first, so volume accumulates outward from the spread towards the chart edges.
 *
 * Levels are spaced evenly by rank rather than by price, as in the design: the
 * spread sits at the exact centre and each side fills its half. On a price axis
 * the top of a liquid book (twenty levels within a few cents) would collapse
 * into a sliver beside the centre line.
 */
export function buildDepthGeometry(
  bids: readonly PriceLevel[],
  asks: readonly PriceLevel[],
  width: number,
  height: number,
): DepthGeometry | null {
  const bidSteps = cumulative(bids);
  const askSteps = cumulative(asks);
  const bidVolume = bidSteps.at(-1);
  const askVolume = askSteps.at(-1);
  if (bidVolume === undefined || askVolume === undefined) return null;

  const peak = Math.max(bidVolume, askVolume);
  if (peak <= 0) return null;
  const midX = width / 2;
  const y = (volume: number): number => height - (volume / peak) * height * HEADROOM;

  const area = (steps: readonly number[], direction: -1 | 1): string => {
    const spacing = midX / Math.max(1, steps.length - 1);
    const outward = steps.map((volume, rank) => ({
      x: midX + direction * rank * spacing,
      y: y(volume),
    }));
    const ascending = direction === -1 ? [...outward].reverse() : outward;
    const leftX = direction === -1 ? 0 : midX;

    return [
      `M ${format({ x: leftX, y: height })}`,
      ...ascending.slice(0, 1).map((point) => `L ${format(point)}`),
      smoothCurve(ascending),
      `L ${format({ x: leftX + midX, y: height })}`,
      'Z',
    ].join(' ');
  };

  return {
    bidPath: area(bidSteps, -1),
    askPath: area(askSteps, 1),
    midX,
    bidVolume,
    askVolume,
  };
}
