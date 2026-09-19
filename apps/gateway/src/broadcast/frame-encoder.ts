import type { Book, PairSymbol, Ticker } from '@pulsecrypto/contracts';
import type { MarketState } from '../domain/market-state';
import { computeBookMetrics } from '../domain/order-book';
import type { PairRegistry } from '../domain/pairs';

export interface Fragment {
  readonly seq: number;
  readonly json: string;
}

/**
 * Serialises each pair's state at most once per change, however many clients
 * receive it. Frames are assembled by joining the cached fragments, so the cost
 * of a tick grows with the number of changed pairs, not the number of clients.
 */
export class FrameEncoder {
  private readonly tickers = new Map<PairSymbol, Fragment>();
  private readonly books = new Map<PairSymbol, Fragment>();

  constructor(
    private readonly state: MarketState,
    private readonly registry: PairRegistry,
    private readonly bookDepth: number,
  ) {}

  ticker(pair: PairSymbol): Fragment | undefined {
    const current = this.state.ticker(pair);
    if (!current) return undefined;
    const cached = this.tickers.get(pair);
    if (cached?.seq === current.seq) return cached;

    const ticker: Ticker = {
      pair,
      ts: current.ts,
      price: current.price,
      change24hPct: current.stats.changePct,
      high24h: current.stats.high,
      low24h: current.stats.low,
      volume24h: current.stats.volume,
    };
    const fragment = { seq: current.seq, json: JSON.stringify(ticker) };
    this.tickers.set(pair, fragment);
    return fragment;
  }

  book(pair: PairSymbol): Fragment | undefined {
    const current = this.state.book(pair);
    if (!current) return undefined;
    const cached = this.books.get(pair);
    if (cached?.seq === current.seq) return cached;

    const { snapshot } = current;
    const priceDecimals = this.registry.get(pair)?.priceDecimals ?? 8;
    const book: Book = {
      pair,
      ts: snapshot.receivedAt,
      lastUpdateId: snapshot.lastUpdateId,
      ...computeBookMetrics(snapshot.bids, snapshot.asks, priceDecimals),
      bids: snapshot.bids.slice(0, this.bookDepth),
      asks: snapshot.asks.slice(0, this.bookDepth),
    };
    const fragment = { seq: current.seq, json: JSON.stringify(book) };
    this.books.set(pair, fragment);
    return fragment;
  }

  marketFrame(ts: number, tickers: readonly string[], books: readonly string[]): string {
    return `{"type":"market","ts":${ts},"tickers":[${tickers.join(',')}],"books":[${books.join(',')}]}`;
  }
}
