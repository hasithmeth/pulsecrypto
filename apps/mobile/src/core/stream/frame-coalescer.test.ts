import type { Book, MarketMessage, Ticker } from '@pulsecrypto/contracts';
import { FrameCoalescer, type MarketBatch } from './frame-coalescer';

const ticker = (pair: string, price: number): Ticker => ({
  pair,
  ts: 0,
  price,
  change24hPct: 0,
  high24h: 0,
  low24h: 0,
  volume24h: 0,
});

const book = (pair: string, lastUpdateId: number): Book => ({
  pair,
  ts: 0,
  lastUpdateId,
  spread: 0,
  spreadPct: 0,
  buyPressure: 50,
  sellPressure: 50,
  bids: [],
  asks: [],
});

const frame = (tickers: Ticker[], books: Book[] = []): MarketMessage => ({
  type: 'market',
  ts: 0,
  tickers,
  books,
});

function setup() {
  const commits: MarketBatch[] = [];
  const scheduled: (() => void)[] = [];
  const coalescer = new FrameCoalescer(
    (batch) => commits.push(batch),
    (flush) => scheduled.push(flush),
  );
  const runFrame = (): void => {
    scheduled.splice(0).forEach((flush) => {
      flush();
    });
  };
  return { coalescer, commits, scheduled, runFrame };
}

describe('FrameCoalescer', () => {
  it('collapses a burst into one commit holding the latest value per pair', () => {
    const { coalescer, commits, scheduled, runFrame } = setup();

    coalescer.push(frame([ticker('BTCUSDT', 1), ticker('ETHUSDT', 10)], [book('BTCUSDT', 1)]));
    coalescer.push(frame([ticker('BTCUSDT', 2)], [book('BTCUSDT', 2)]));
    coalescer.push(frame([ticker('BTCUSDT', 3)]));

    expect(scheduled).toHaveLength(1);
    expect(commits).toHaveLength(0);

    runFrame();

    expect(commits).toHaveLength(1);
    expect(commits[0]?.tickers).toEqual([ticker('BTCUSDT', 3), ticker('ETHUSDT', 10)]);
    expect(commits[0]?.books).toEqual([book('BTCUSDT', 2)]);
    expect(coalescer.counters).toEqual({ commits: 1, coalescedFrames: 2 });
  });

  it('starts a fresh batch after each flush', () => {
    const { coalescer, commits, runFrame } = setup();

    coalescer.push(frame([ticker('BTCUSDT', 1)]));
    runFrame();
    coalescer.push(frame([ticker('ETHUSDT', 10)]));
    runFrame();

    expect(commits.map((batch) => batch.tickers.map((entry) => entry.pair))).toEqual([
      ['BTCUSDT'],
      ['ETHUSDT'],
    ]);
    expect(coalescer.counters.coalescedFrames).toBe(0);
  });
});
