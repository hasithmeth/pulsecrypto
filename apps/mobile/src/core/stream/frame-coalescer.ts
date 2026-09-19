import type { Book, MarketMessage, PairSymbol, Ticker } from '@pulsecrypto/contracts';

export interface MarketBatch {
  readonly tickers: readonly Ticker[];
  readonly books: readonly Book[];
}

type Schedule = (flush: () => void) => void;

/**
 * Client-side mirror of the gateway's conflation. Frames that arrive between
 * two animation frames collapse into one store commit holding only the latest
 * value per pair, so a burst (after a JS stall, or at a 10 ms interval) costs
 * one render pass instead of one per message.
 */
export class FrameCoalescer {
  readonly counters = { commits: 0, coalescedFrames: 0 };

  private readonly tickers = new Map<PairSymbol, Ticker>();
  private readonly books = new Map<PairSymbol, Book>();
  private pendingFrames = 0;

  constructor(
    private readonly commit: (batch: MarketBatch) => void,
    private readonly schedule: Schedule = (flush) => requestAnimationFrame(flush),
  ) {}

  push(message: MarketMessage): void {
    for (const ticker of message.tickers) this.tickers.set(ticker.pair, ticker);
    for (const book of message.books) this.books.set(book.pair, book);

    this.pendingFrames += 1;
    if (this.pendingFrames === 1) this.schedule(this.flush);
  }

  private readonly flush = (): void => {
    const batch: MarketBatch = {
      tickers: [...this.tickers.values()],
      books: [...this.books.values()],
    };
    this.counters.commits += 1;
    this.counters.coalescedFrames += this.pendingFrames - 1;
    this.tickers.clear();
    this.books.clear();
    this.pendingFrames = 0;
    this.commit(batch);
  };
}
