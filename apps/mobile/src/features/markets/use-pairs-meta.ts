import { PairsMetaResponseSchema, type PairMeta, type PairSymbol } from '@pulsecrypto/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { requestJson } from '@/core/api/http-client';
import { gateway } from '@/core/config/gateway';
import { useConnectionPhase } from '@/core/stream/connection-store';

const PAIRS_META_KEY = ['pairs-meta'] as const;

export function usePairsMeta() {
  return useQuery({
    queryKey: PAIRS_META_KEY,
    queryFn: ({ signal }) => requestJson(gateway.pairsMetaUrl, PairsMetaResponseSchema, { signal }),
    select: (response) => response.pairs,
  });
}

export function usePairMeta(symbol: PairSymbol): PairMeta | undefined {
  return usePairsMeta().data?.find((pair) => pair.symbol === symbol);
}

/**
 * A socket that just came back is the best signal that the gateway is reachable
 * again, so a metadata request that failed while it was down is retried then.
 */
export function useRecoverPairsMetaOnReconnect(): void {
  const queryClient = useQueryClient();
  const phase = useConnectionPhase();

  useEffect(() => {
    if (phase !== 'open') return;
    const state = queryClient.getQueryState(PAIRS_META_KEY);
    if (state?.status === 'error') void queryClient.invalidateQueries({ queryKey: PAIRS_META_KEY });
  }, [phase, queryClient]);
}
