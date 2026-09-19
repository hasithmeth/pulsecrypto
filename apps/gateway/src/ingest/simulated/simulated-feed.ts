import type { PairSymbol, PriceLevel } from '@pulsecrypto/contracts';
import type { PairRegistry } from '../../domain/pairs';
import type { MarketFeed, MarketFeedSink } from '../market-feed';

export interface SimulatedFeedOptions {
  readonly registry: PairRegistry;
  readonly sink: MarketFeedSink;
  /** Raw updates emitted per second across all pairs. */
  readonly updatesPerSecond: number;
  readonly levels?: number;
  readonly seed?: number;
  readonly now?: () => number;
}

interface SimulatedPair {
  readonly symbol: PairSymbol;
  readonly tick: number;
  readonly open: number;
  mid: number;
  high: number;
  low: number;
  volume: number;
  updateId: number;
}

const SEED_PRICES: Readonly<Record<string, number>> = {
  BTCUSDT: 64_000,
  ETHUSDT: 3_100,
  SOLUSDT: 145,
  DOGEUSDT: 0.12,
  XRPUSDT: 0.52,
  BNBUSDT: 580,
  ADAUSDT: 0.45,
  LINKUSDT: 14,
  AVAXUSDT: 28,
  LTCUSDT: 72,
};

const BATCH_INTERVAL_MS = 10;
const STATS_INTERVAL_MS = 1_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Synthetic random-walk market used for offline demos and load tests. It can
 * produce far more raw updates than Binance does, which makes the effect of
 * conflation and slow-consumer protection observable.
 */
export class SimulatedFeed implements MarketFeed {
  private readonly pairs: SimulatedPair[];
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly levels: number;
  private batchTimer: NodeJS.Timeout | undefined;
  private statsTimer: NodeJS.Timeout | undefined;
  private carry = 0;
  private cursor = 0;

  constructor(private readonly options: SimulatedFeedOptions) {
    this.random = mulberry32(options.seed ?? 1);
    this.now = options.now ?? Date.now;
    this.levels = options.levels ?? 20;
    this.pairs = options.registry.definitions.map((definition) => {
      const price = SEED_PRICES[definition.symbol] ?? 100;
      return {
        symbol: definition.symbol,
        tick: 10 ** -definition.priceDecimals,
        open: price,
        mid: price,
        high: price,
        low: price,
        volume: 0,
        updateId: 0,
      };
    });
  }

  start(): void {
    if (this.batchTimer) return;
    this.options.sink.onStatus('connecting');
    this.emitStats();
    this.options.sink.onStatus('live');
    this.batchTimer = setInterval(() => {
      this.emitBatch();
    }, BATCH_INTERVAL_MS);
    this.statsTimer = setInterval(() => {
      this.emitStats();
    }, STATS_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.batchTimer);
    clearInterval(this.statsTimer);
    this.batchTimer = undefined;
    this.statsTimer = undefined;
  }

  private emitBatch(): void {
    this.carry += (this.options.updatesPerSecond * BATCH_INTERVAL_MS) / 1_000;
    const count = Math.floor(this.carry);
    this.carry -= count;
    for (let i = 0; i < count; i += 1) {
      const pair = this.pairs[this.cursor % this.pairs.length];
      this.cursor += 1;
      if (pair) this.emitUpdate(pair, i % 2 === 0);
    }
  }

  private emitUpdate(pair: SimulatedPair, asTrade: boolean): void {
    const { sink } = this.options;
    const drift = (this.random() - 0.5) * pair.mid * 0.0004;
    pair.mid = Math.max(pair.tick, pair.mid + drift);
    pair.high = Math.max(pair.high, pair.mid);
    pair.low = Math.min(pair.low, pair.mid);

    if (asTrade) {
      pair.volume += this.random() * 2;
      sink.onTrade(pair.symbol, this.quantise(pair.mid, pair.tick), this.now());
      return;
    }

    pair.updateId += 1;
    sink.onBook(pair.symbol, {
      lastUpdateId: pair.updateId,
      receivedAt: this.now(),
      bids: this.buildSide(pair, -1),
      asks: this.buildSide(pair, 1),
    });
  }

  private emitStats(): void {
    const ts = this.now();
    for (const pair of this.pairs) {
      this.options.sink.onDayStats(pair.symbol, {
        eventTime: ts,
        lastPrice: this.quantise(pair.mid, pair.tick),
        changePct: Math.round(((pair.mid - pair.open) / pair.open) * 10_000) / 100,
        high: this.quantise(pair.high, pair.tick),
        low: this.quantise(pair.low, pair.tick),
        volume: Math.round(pair.volume * 100) / 100,
      });
    }
  }

  private buildSide(pair: SimulatedPair, direction: -1 | 1): PriceLevel[] {
    const halfSpread = pair.tick * (1 + Math.floor(this.random() * 3));
    return Array.from({ length: this.levels }, (_, index): PriceLevel => {
      const price = pair.mid + direction * (halfSpread + index * pair.tick * 2);
      const quantity = Math.round((0.05 + this.random() * 5) * 1_000) / 1_000;
      return [this.quantise(Math.max(pair.tick, price), pair.tick), quantity];
    });
  }

  private quantise(value: number, tick: number): number {
    const decimals = Math.max(0, Math.round(-Math.log10(tick)));
    return Number((Math.round(value / tick) * tick).toFixed(decimals));
  }
}
