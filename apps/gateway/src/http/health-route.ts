import type { FastifyPluginCallback } from 'fastify';
import type { Broadcaster } from '../broadcast/broadcaster';
import type { Metrics } from '../observability/metrics';

interface HealthRouteOptions {
  readonly broadcaster: Broadcaster;
  readonly metrics: Metrics;
}

export const healthRoute: FastifyPluginCallback<HealthRouteOptions> = (
  app,
  { broadcaster, metrics },
  done,
) => {
  app.get('/health', () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    upstream: broadcaster.upstreamStatus,
    clients: broadcaster.clientCount,
    memory: { rssBytes: process.memoryUsage.rss() },
    metrics: metrics.snapshot(),
  }));
  done();
};
