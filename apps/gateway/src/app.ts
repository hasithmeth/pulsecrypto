import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { Broadcaster } from './broadcast/broadcaster';
import { FrameEncoder } from './broadcast/frame-encoder';
import type { Config } from './config/env';
import { MarketState } from './domain/market-state';
import { PairRegistry } from './domain/pairs';
import { healthRoute } from './http/health-route';
import { pairsMetaRoute } from './http/pairs-meta-route';
import { streamRoute } from './http/stream-route';
import { BinanceFeed } from './ingest/binance/binance-feed';
import type { MarketFeed, MarketFeedSink } from './ingest/market-feed';
import { SimulatedFeed } from './ingest/simulated/simulated-feed';
import { Metrics } from './observability/metrics';

export interface AppOverrides {
  readonly createFeed?: (sink: MarketFeedSink, registry: PairRegistry) => MarketFeed;
  readonly now?: () => number;
}

const loggerOptions = (config: Config): FastifyServerOptions['logger'] => {
  if (config.env === 'test') return false;
  if (config.env === 'production') return { level: config.logLevel };
  return {
    level: config.logLevel,
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
    },
  };
};

export async function buildApp(
  config: Config,
  overrides: AppOverrides = {},
): Promise<FastifyInstance> {
  const now = overrides.now ?? Date.now;
  const app = Fastify({
    logger: loggerOptions(config),
    logController: new LogController({ disableRequestLogging: true }),
  });

  const registry = new PairRegistry(config.pairs);
  const state = new MarketState(registry.symbols);
  const metrics = new Metrics(now);
  const broadcaster = new Broadcaster({
    pairs: registry.symbols,
    encoder: new FrameEncoder(state, registry, config.broadcast.bookDepth),
    metrics,
    logger: app.log,
    broadcast: config.broadcast,
    clients: config.clients,
    now,
  });

  const sink: MarketFeedSink = {
    onTrade(pair, price, ts) {
      metrics.ingested += 1;
      state.applyTrade(pair, price, ts);
    },
    onDayStats(pair, stats) {
      metrics.ingested += 1;
      state.applyDayStats(pair, stats);
    },
    onBook(pair, snapshot) {
      metrics.ingested += 1;
      state.applyBook(pair, snapshot);
    },
    onStatus(status) {
      app.log.info({ upstream: status }, 'upstream status changed');
      broadcaster.setUpstreamStatus(status);
    },
    onInvalidMessage(reason) {
      metrics.invalidUpstreamMessages += 1;
      app.log.debug({ reason }, 'dropped invalid upstream message');
    },
  };

  const feed = (overrides.createFeed ?? defaultFeedFactory(config, app))(sink, registry);
  let statsTimer: NodeJS.Timeout | undefined;

  app.addHook('onReady', () => {
    metrics.start();
    broadcaster.start();
    feed.start();
    if (config.statsLogIntervalMs > 0) {
      statsTimer = setInterval(() => {
        const { ingestedPerSecond, framesPerSecond, ticksSkipped, evictions } = metrics.snapshot();
        app.log.info(
          {
            clients: broadcaster.clientCount,
            ingestedPerSecond,
            framesPerSecond,
            ticksSkipped,
            evictions,
          },
          'throughput',
        );
      }, config.statsLogIntervalMs);
      statsTimer.unref();
    }
  });

  // Registered before the websocket plugin so clients receive a clean shutdown
  // close code before the plugin tears their sockets down.
  app.addHook('preClose', () => {
    clearInterval(statsTimer);
    feed.stop();
    broadcaster.stop();
    metrics.stop();
  });

  await app.register(streamRoute, { broadcaster });
  await app.register(pairsMetaRoute, { registry, state, now });
  await app.register(healthRoute, { broadcaster, metrics });

  return app;
}

const defaultFeedFactory =
  (config: Config, app: FastifyInstance): NonNullable<AppOverrides['createFeed']> =>
  (sink, registry) =>
    config.upstream.source === 'simulated'
      ? new SimulatedFeed({
          registry,
          sink,
          updatesPerSecond: config.upstream.simulatedUpdatesPerSecond,
        })
      : new BinanceFeed({
          baseUrl: config.upstream.binanceUrl,
          pairs: registry.symbols,
          staleAfterMs: config.upstream.staleAfterMs,
          sink,
          logger: app.log,
        });
