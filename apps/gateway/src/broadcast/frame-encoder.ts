import { encode } from '@msgpack/msgpack';
import type { Book, Encoding, PairSymbol, Ticker } from '@pulsecrypto/contracts';
import type { MarketState } from '../domain/market-state';
import { computeBookMetrics } from '../domain/order-book';
import type { PairRegistry } from '../domain/pairs';
import { packMarketFrame } from './msgpack-frame';

/** One pair's state at one sequence number, encoded lazily and at most once per wire format. */
export class Fragment {
  private cachedJson: string | undefined;
  private cachedPacked: Uint8Array | undefined;

  constructor(
    readonly seq: number,
    private readonly value: Ticker | Book,
  ) {}

  get json(): string {
    return (this.cachedJson ??= JSON.stringify(this.value));
  }

  get packed(): Uint8Array {
    return (this.cachedPacked ??= encode(this.value));
  }
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

    const fragment = new Fragment(current.seq, {
      pair,
      ts: current.ts,
      price: current.price,
      change24hPct: current.stats.changePct,
      high24h: current.stats.high,
      low24h: current.stats.low,
      volume24h: current.stats.volume,
    });
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
    const fragment = new Fragment(current.seq, {
      pair,
      ts: snapshot.receivedAt,
      lastUpdateId: snapshot.lastUpdateId,
      ...computeBookMetrics(snapshot.bids, snapshot.asks, priceDecimals),
      bids: snapshot.bids.slice(0, this.bookDepth),
      asks: snapshot.asks.slice(0, this.bookDepth),
    });
    this.books.set(pair, fragment);
    return fragment;
  }

  marketFrame(
    encoding: Encoding,
    ts: number,
    tickers: readonly Fragment[],
    books: readonly Fragment[],
  ): string | Uint8Array {
    if (encoding === 'msgpack') {
      return packMarketFrame(
        ts,
        tickers.map((fragment) => fragment.packed),
        books.map((fragment) => fragment.packed),
      );
    }
    const join = (fragments: readonly Fragment[]): string =>
      fragments.map((fragment) => fragment.json).join(',');
    return `{"type":"market","ts":${ts},"tickers":[${join(tickers)}],"books":[${join(books)}]}`;
  }
}
