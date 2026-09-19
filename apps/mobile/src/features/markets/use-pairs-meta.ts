import { PairsMetaResponseSchema, type PairMeta, type PairSymbol } from '@pulsecrypto/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { requestJson } from '@/core/api/http-client';
import { gateway } from '@/core/config/gateway';
import { useConnectionPhase } from '@/core/stream/connection-store';

const PAIRS_META_KEY = ['pairs-meta'] as const;

// A local gateway answers in under a millisecond. Without a floor the spinner is
// gone before the finger lifts, and a refresh that worked looks like one that did not.
const MIN_REFRESH_INDICATOR_MS = 600;

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
 * Pull-to-refresh for the metadata query. It refetches over HTTP only; the
 * socket belongs to the stream layer and keeps delivering throughout.
 */
export function usePairsMetaRefresh(): { refreshing: boolean; refresh: () => void } {
  const { refetch } = usePairsMeta();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = (): void => {
    setRefreshing(true);
    const indicatorFloor = new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_INDICATOR_MS));
    void Promise.all([refetch(), indicatorFloor]).finally(() => {
      setRefreshing(false);
    });
  };

  return { refreshing, refresh };
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
