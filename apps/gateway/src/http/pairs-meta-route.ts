import { PAIRS_META_PATH, type PairsMetaResponse } from '@pulsecrypto/contracts';
import type { FastifyPluginCallback } from 'fastify';
import type { MarketState } from '../domain/market-state';
import type { PairRegistry } from '../domain/pairs';

interface PairsMetaRouteOptions {
  readonly registry: PairRegistry;
  readonly state: MarketState;
  readonly now: () => number;
}

/**
 * Names, precision and trading status come from the static registry. The 24h
 * figures are live values from the ticker stream, or null until they arrive.
 */
export const pairsMetaRoute: FastifyPluginCallback<PairsMetaRouteOptions> = (
  app,
  { registry, state, now },
  done,
) => {
  app.get(PAIRS_META_PATH, (_request, reply): PairsMetaResponse => {
    void reply.header('cache-control', 'no-store');
    return {
      updatedAt: now(),
      pairs: registry.definitions.map((definition) => {
        const stats = state.dayStats(definition.symbol);
        return {
          ...definition,
          high24h: stats?.high ?? null,
          low24h: stats?.low ?? null,
          volume24h: stats?.volume ?? null,
        };
      }),
    };
  });
  done();
};
