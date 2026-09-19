import { z } from 'zod';

export const PairSymbolSchema = z.string().regex(/^[A-Z0-9]{5,20}$/);
export type PairSymbol = z.infer<typeof PairSymbolSchema>;

/** `[price, quantity]` */
export const PriceLevelSchema = z.tuple([z.number(), z.number()]);
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

export const TickerSchema = z.object({
  pair: PairSymbolSchema,
  ts: z.number(),
  price: z.number(),
  change24hPct: z.number(),
  high24h: z.number(),
  low24h: z.number(),
  volume24h: z.number(),
});
export type Ticker = z.infer<typeof TickerSchema>;

export const BookSchema = z.object({
  pair: PairSymbolSchema,
  ts: z.number(),
  lastUpdateId: z.number(),
  spread: z.number(),
  spreadPct: z.number(),
  buyPressure: z.number(),
  sellPressure: z.number(),
  bids: z.array(PriceLevelSchema),
  asks: z.array(PriceLevelSchema),
});
export type Book = z.infer<typeof BookSchema>;

export const UpstreamStatusSchema = z.enum(['connecting', 'live', 'down']);
export type UpstreamStatus = z.infer<typeof UpstreamStatusSchema>;
