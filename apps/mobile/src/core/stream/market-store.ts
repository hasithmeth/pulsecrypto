import type { Book, PairSymbol, Ticker } from '@pulsecrypto/contracts';
import { create } from 'zustand';
import type { MarketBatch } from './frame-coalescer';

interface MarketStore {
  readonly tickers: Readonly<Record<PairSymbol, Ticker>>;
  readonly books: Readonly<Record<PairSymbol, Book>>;
  readonly lastFrameAt: number | null;
  readonly applyBatch: (batch: MarketBatch, receivedAt: number) => void;
  readonly reset: () => void;
}

/**
 * Live market data, written only by the stream layer. It is never cleared on
 * disconnect, which is what keeps the last known prices on screen while offline.
 * It is cleared when the app recovers from a crash, because the data on screen
 * at that moment is the most likely cause.
 */
export const useMarketStore = create<MarketStore>((set) => ({
  tickers: {},
  books: {},
  lastFrameAt: null,
  applyBatch: (batch, receivedAt) => {
    set((state) => {
      const tickers: Record<PairSymbol, Ticker> = { ...state.tickers };
      for (const ticker of batch.tickers) tickers[ticker.pair] = ticker;

      const books: Record<PairSymbol, Book> = { ...state.books };
      for (const book of batch.books) books[book.pair] = book;

      return {
        tickers: batch.tickers.length > 0 ? tickers : state.tickers,
        books: batch.books.length > 0 ? books : state.books,
        lastFrameAt: receivedAt,
      };
    });
  },
  reset: () => {
    set({ tickers: {}, books: {}, lastFrameAt: null });
  },
}));

export const useTicker = (pair: PairSymbol): Ticker | undefined =>
  useMarketStore((state) => state.tickers[pair]);

export const useBook = (pair: PairSymbol): Book | undefined =>
  useMarketStore((state) => state.books[pair]);
