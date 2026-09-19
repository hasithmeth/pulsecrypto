import type { PairSymbol } from '@pulsecrypto/contracts';
import type { BookSnapshot } from './order-book';

export interface DayStats {
  readonly eventTime: number;
  readonly lastPrice: number;
  readonly changePct: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
}

export interface TickerState {
  readonly seq: number;
  readonly ts: number;
  readonly price: number;
  readonly stats: DayStats;
}

export interface BookState {
  readonly seq: number;
  readonly snapshot: BookSnapshot;
}

interface PairSlot {
  tickerSeq: number;
  bookSeq: number;
  price?: number;
  priceTs?: number;
  stats?: DayStats;
  book?: BookSnapshot;
}

/**
 * Conflating buffer: one slot per pair holding only the latest value of each
 * stream. Writes overwrite in O(1), so memory is bounded by the number of pairs
 * no matter how fast the upstream produces. Sequence numbers let readers detect
 * change without copying or queueing.
 */
export class MarketState {
  private readonly slots: ReadonlyMap<PairSymbol, PairSlot>;

  constructor(pairs: readonly PairSymbol[]) {
    this.slots = new Map(pairs.map((pair) => [pair, { tickerSeq: 0, bookSeq: 0 }]));
  }

  applyTrade(pair: PairSymbol, price: number, ts: number): void {
    const slot = this.slots.get(pair);
    if (!slot) return;
    slot.price = price;
    slot.priceTs = ts;
    slot.tickerSeq += 1;
  }

  applyDayStats(pair: PairSymbol, stats: DayStats): void {
    const slot = this.slots.get(pair);
    if (!slot) return;
    slot.stats = stats;
    if (slot.priceTs === undefined || stats.eventTime >= slot.priceTs) {
      slot.price = stats.lastPrice;
      slot.priceTs = stats.eventTime;
    }
    slot.tickerSeq += 1;
  }

  applyBook(pair: PairSymbol, snapshot: BookSnapshot): void {
    const slot = this.slots.get(pair);
    if (!slot) return;
    if (slot.book && snapshot.lastUpdateId < slot.book.lastUpdateId) return;
    slot.book = snapshot;
    slot.bookSeq += 1;
  }

  /** Undefined until 24h statistics have arrived, so clients never see a partial ticker. */
  ticker(pair: PairSymbol): TickerState | undefined {
    const slot = this.slots.get(pair);
    if (!slot?.stats || slot.price === undefined || slot.priceTs === undefined) return undefined;
    return { seq: slot.tickerSeq, ts: slot.priceTs, price: slot.price, stats: slot.stats };
  }

  book(pair: PairSymbol): BookState | undefined {
    const slot = this.slots.get(pair);
    if (!slot?.book) return undefined;
    return { seq: slot.bookSeq, snapshot: slot.book };
  }

  dayStats(pair: PairSymbol): DayStats | undefined {
    return this.slots.get(pair)?.stats;
  }
}
