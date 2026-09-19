import type { PairSymbol, PriceLevel } from '@pulsecrypto/contracts';
import { z } from 'zod';
import type { DayStats } from '../../domain/market-state';
import type { BookSnapshot } from '../../domain/order-book';

const numeric = z.string().transform(Number).pipe(z.number());

const LevelSchema = z.tuple([numeric, numeric]);

const PartialDepthSchema = z.object({
  lastUpdateId: z.number(),
  bids: z.array(LevelSchema),
  asks: z.array(LevelSchema),
});

const AggTradeSchema = z.object({
  e: z.literal('aggTrade'),
  E: z.number(),
  p: numeric,
});

const DayTickerSchema = z.object({
  e: z.literal('24hrTicker'),
  E: z.number(),
  c: numeric,
  P: numeric,
  h: numeric,
  l: numeric,
  v: numeric,
});

const EnvelopeSchema = z.object({
  stream: z.string(),
  data: z.unknown(),
});

export type BinanceEvent =
  | { kind: 'book'; pair: PairSymbol; snapshot: BookSnapshot }
  | { kind: 'trade'; pair: PairSymbol; price: number; ts: number }
  | { kind: 'dayStats'; pair: PairSymbol; stats: DayStats };

export const streamNames = (pair: PairSymbol, depth: 5 | 10 | 20 = 20): string[] => {
  const symbol = pair.toLowerCase();
  return [`${symbol}@depth${depth}@100ms`, `${symbol}@aggTrade`, `${symbol}@ticker`];
};

export const combinedStreamUrl = (baseUrl: string, pairs: readonly PairSymbol[]): string =>
  `${baseUrl}/stream?streams=${pairs.flatMap((pair) => streamNames(pair)).join('/')}`;

const nonEmptyLevels = (levels: readonly PriceLevel[]): PriceLevel[] =>
  levels.filter(([, quantity]) => quantity > 0);

/**
 * Partial depth payloads carry no symbol or event time, so the pair comes from
 * the stream name and the timestamp from the local clock.
 */
export function parseBinanceMessage(raw: string, receivedAt: number): BinanceEvent {
  const envelope = EnvelopeSchema.parse(JSON.parse(raw));
  const [symbol = '', channel = ''] = envelope.stream.split('@');
  const pair = symbol.toUpperCase();

  if (channel.startsWith('depth')) {
    const depth = PartialDepthSchema.parse(envelope.data);
    return {
      kind: 'book',
      pair,
      snapshot: {
        lastUpdateId: depth.lastUpdateId,
        receivedAt,
        bids: nonEmptyLevels(depth.bids),
        asks: nonEmptyLevels(depth.asks),
      },
    };
  }

  if (channel === 'aggTrade') {
    const trade = AggTradeSchema.parse(envelope.data);
    return { kind: 'trade', pair, price: trade.p, ts: trade.E };
  }

  if (channel === 'ticker') {
    const ticker = DayTickerSchema.parse(envelope.data);
    return {
      kind: 'dayStats',
      pair,
      stats: {
        eventTime: ticker.E,
        lastPrice: ticker.c,
        changePct: ticker.P,
        high: ticker.h,
        low: ticker.l,
        volume: ticker.v,
      },
    };
  }

  throw new Error(`Unhandled stream "${envelope.stream}"`);
}
