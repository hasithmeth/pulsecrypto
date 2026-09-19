import { z } from 'zod';
import { BookSchema, PairSymbolSchema, TickerSchema, UpstreamStatusSchema } from './market';

export const ChannelSchema = z.enum(['book']);

export const EncodingSchema = z.enum(['json', 'msgpack']);
export type Encoding = z.infer<typeof EncodingSchema>;
export type Channel = z.infer<typeof ChannelSchema>;

export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.number().int(),
  serverTime: z.number(),
  intervalMs: z.number(),
  encoding: EncodingSchema,
  limits: z.object({
    minIntervalMs: z.number(),
    maxIntervalMs: z.number(),
  }),
  pairs: z.array(PairSymbolSchema),
  upstream: UpstreamStatusSchema,
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

export const MarketMessageSchema = z.object({
  type: z.literal('market'),
  ts: z.number(),
  tickers: z.array(TickerSchema),
  books: z.array(BookSchema),
});
export type MarketMessage = z.infer<typeof MarketMessageSchema>;

export const StatusMessageSchema = z.object({
  type: z.literal('status'),
  upstream: UpstreamStatusSchema,
});
export type StatusMessage = z.infer<typeof StatusMessageSchema>;

export const ConfiguredMessageSchema = z.object({
  type: z.literal('configured'),
  intervalMs: z.number(),
  encoding: EncodingSchema,
});
export type ConfiguredMessage = z.infer<typeof ConfiguredMessageSchema>;

export const PongMessageSchema = z.object({
  type: z.literal('pong'),
  id: z.number(),
  serverTime: z.number(),
});
export type PongMessage = z.infer<typeof PongMessageSchema>;

export const ErrorCodeSchema = z.enum(['invalid_message', 'unknown_pair', 'unauthenticated']);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  MarketMessageSchema,
  StatusMessageSchema,
  ConfiguredMessageSchema,
  PongMessageSchema,
  ErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const AuthMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1).max(4096),
});

export const SubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  channel: ChannelSchema,
  pair: PairSymbolSchema,
});

export const UnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  channel: ChannelSchema,
  pair: PairSymbolSchema,
});

export const ConfigureMessageSchema = z
  .object({
    type: z.literal('configure'),
    intervalMs: z.number().positive().optional(),
    encoding: EncodingSchema.optional(),
  })
  .refine((message) => message.intervalMs !== undefined || message.encoding !== undefined, {
    message: 'configure needs intervalMs or encoding',
  });

export const PingMessageSchema = z.object({
  type: z.literal('ping'),
  id: z.number(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  ConfigureMessageSchema,
  PingMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
