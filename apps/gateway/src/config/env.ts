import { PairSymbolSchema } from '@pulsecrypto/contracts';
import { z } from 'zod';

const pairList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean),
  )
  .pipe(z.array(PairSymbolSchema).min(1));

const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    PAIRS: pairList.default([
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'DOGEUSDT',
      'XRPUSDT',
      'BNBUSDT',
      'ADAUSDT',
      'LINKUSDT',
    ]),

    MARKET_SOURCE: z.enum(['binance', 'simulated']).default('binance'),
    BINANCE_WS_URL: z.url({ protocol: /^wss?$/ }).default('wss://stream.binance.com:9443'),
    UPSTREAM_STALE_AFTER_MS: int(10_000, 1_000),
    SIMULATED_UPDATES_PER_SECOND: int(200, 1),

    BROADCAST_INTERVAL_MS: int(100, 10),
    MIN_CLIENT_INTERVAL_MS: int(10, 10),
    MAX_CLIENT_INTERVAL_MS: int(1_000, 10),
    BOOK_DEPTH: int(20, 1),

    MAX_CLIENTS: int(100, 1),
    CLIENT_HIGH_WATERMARK_BYTES: int(256 * 1024, 1),
    CLIENT_HARD_LIMIT_BYTES: int(1024 * 1024, 1),
    CLIENT_MAX_CONGESTION_MS: int(5_000, 0),
    CLIENT_HEARTBEAT_MS: int(3_000, 100),
    CLIENT_PING_INTERVAL_MS: int(15_000, 1_000),
    CLIENT_MAX_INVALID_MESSAGES: int(5, 1),

    STATS_LOG_INTERVAL_MS: int(10_000),
  })
  .refine((env) => env.MIN_CLIENT_INTERVAL_MS <= env.MAX_CLIENT_INTERVAL_MS, {
    message: 'MIN_CLIENT_INTERVAL_MS must not exceed MAX_CLIENT_INTERVAL_MS',
  })
  .refine(
    (env) =>
      env.BROADCAST_INTERVAL_MS >= env.MIN_CLIENT_INTERVAL_MS &&
      env.BROADCAST_INTERVAL_MS <= env.MAX_CLIENT_INTERVAL_MS,
    { message: 'BROADCAST_INTERVAL_MS must sit within the client interval range' },
  )
  .refine((env) => env.CLIENT_HIGH_WATERMARK_BYTES <= env.CLIENT_HARD_LIMIT_BYTES, {
    message: 'CLIENT_HIGH_WATERMARK_BYTES must not exceed CLIENT_HARD_LIMIT_BYTES',
  });

type Env = z.infer<typeof EnvSchema>;

export interface Config {
  readonly env: Env['NODE_ENV'];
  readonly host: string;
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly pairs: readonly string[];
  readonly upstream: {
    readonly source: Env['MARKET_SOURCE'];
    readonly binanceUrl: string;
    readonly staleAfterMs: number;
    readonly simulatedUpdatesPerSecond: number;
  };
  readonly broadcast: {
    readonly defaultIntervalMs: number;
    readonly minIntervalMs: number;
    readonly maxIntervalMs: number;
    readonly bookDepth: number;
  };
  readonly clients: {
    readonly maxClients: number;
    readonly highWatermarkBytes: number;
    readonly hardLimitBytes: number;
    readonly maxCongestionMs: number;
    readonly heartbeatMs: number;
    readonly pingIntervalMs: number;
    readonly maxInvalidMessages: number;
  };
  readonly statsLogIntervalMs: number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const env = result.data;
  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    pairs: env.PAIRS,
    upstream: {
      source: env.MARKET_SOURCE,
      binanceUrl: env.BINANCE_WS_URL.replace(/\/+$/, ''),
      staleAfterMs: env.UPSTREAM_STALE_AFTER_MS,
      simulatedUpdatesPerSecond: env.SIMULATED_UPDATES_PER_SECOND,
    },
    broadcast: {
      defaultIntervalMs: env.BROADCAST_INTERVAL_MS,
      minIntervalMs: env.MIN_CLIENT_INTERVAL_MS,
      maxIntervalMs: env.MAX_CLIENT_INTERVAL_MS,
      bookDepth: env.BOOK_DEPTH,
    },
    clients: {
      maxClients: env.MAX_CLIENTS,
      highWatermarkBytes: env.CLIENT_HIGH_WATERMARK_BYTES,
      hardLimitBytes: env.CLIENT_HARD_LIMIT_BYTES,
      maxCongestionMs: env.CLIENT_MAX_CONGESTION_MS,
      heartbeatMs: env.CLIENT_HEARTBEAT_MS,
      pingIntervalMs: env.CLIENT_PING_INTERVAL_MS,
      maxInvalidMessages: env.CLIENT_MAX_INVALID_MESSAGES,
    },
    statsLogIntervalMs: env.STATS_LOG_INTERVAL_MS,
  };
}
