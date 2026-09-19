import type { PriceLevel } from '@pulsecrypto/contracts';

export interface DepthGeometry {
  readonly bidPath: string;
  readonly askPath: string;
  readonly midX: number;
  readonly bidVolume: number;
  readonly askVolume: number;
}

const HEADROOM = 0.9;

function cumulative(levels: readonly PriceLevel[]): { price: number; volume: number }[] {
  let volume = 0;
  return levels.map(([price, quantity]) => {
    volume += quantity;
    return { price, volume };
  });
}

/**
 * Builds stepped cumulative-depth areas. Both sides are ordered best price
 * first, so volume accumulates outward from the spread towards the chart edges.
 */
export function buildDepthGeometry(
  bids: readonly PriceLevel[],
  asks: readonly PriceLevel[],
  width: number,
  height: number,
): DepthGeometry | null {
  const bidSteps = cumulative(bids);
  const askSteps = cumulative(asks);
  const lowest = bidSteps.at(-1);
  const highest = askSteps.at(-1);
  const bestBid = bidSteps[0];
  const bestAsk = askSteps[0];
  if (!lowest || !highest || !bestBid || !bestAsk || highest.price <= lowest.price) return null;

  const peak = Math.max(lowest.volume, highest.volume);
  const x = (price: number): number =>
    ((price - lowest.price) / (highest.price - lowest.price)) * width;
  const y = (volume: number): number => height - (volume / peak) * height * HEADROOM;
  const point = (px: number, py: number): string => `${px.toFixed(1)} ${py.toFixed(1)}`;

  const stepped = (steps: { price: number; volume: number }[], edgeX: number): string => {
    const first = steps[0];
    if (!first) return '';
    const commands = [`M ${point(x(first.price), height)}`];
    let previousY = height;
    for (const step of steps) {
      commands.push(
        `L ${point(x(step.price), previousY)}`,
        `L ${point(x(step.price), y(step.volume))}`,
      );
      previousY = y(step.volume);
    }
    commands.push(`L ${point(edgeX, previousY)}`, `L ${point(edgeX, height)}`, 'Z');
    return commands.join(' ');
  };

  return {
    bidPath: stepped(bidSteps, 0),
    askPath: stepped(askSteps, width),
    midX: x((bestBid.price + bestAsk.price) / 2),
    bidVolume: lowest.volume,
    askVolume: highest.volume,
  };
}
