import type { PairSymbol, UpstreamStatus } from '@pulsecrypto/contracts';
import type { DayStats } from '../domain/market-state';
import type { BookSnapshot } from '../domain/order-book';

export interface MarketFeedSink {
  onTrade(pair: PairSymbol, price: number, ts: number): void;
  onDayStats(pair: PairSymbol, stats: DayStats): void;
  onBook(pair: PairSymbol, snapshot: BookSnapshot): void;
  onStatus(status: UpstreamStatus): void;
  onInvalidMessage(reason: string): void;
}

export interface MarketFeed {
  start(): void;
  stop(): void;
}
