import { z } from 'zod';
import { PairSymbolSchema } from './market';

export const TradingStatusSchema = z.enum(['TRADING', 'HALT', 'BREAK']);
export type TradingStatus = z.infer<typeof TradingStatusSchema>;

export const PairMetaSchema = z.object({
  symbol: PairSymbolSchema,
  base: z.string(),
  quote: z.string(),
  displayName: z.string(),
  status: TradingStatusSchema,
  priceDecimals: z.number().int().nonnegative(),
  quantityDecimals: z.number().int().nonnegative(),
  high24h: z.number().nullable(),
  low24h: z.number().nullable(),
  volume24h: z.number().nullable(),
});
export type PairMeta = z.infer<typeof PairMetaSchema>;

export const PairsMetaResponseSchema = z.object({
  updatedAt: z.number(),
  pairs: z.array(PairMetaSchema),
});
export type PairsMetaResponse = z.infer<typeof PairsMetaResponseSchema>;
