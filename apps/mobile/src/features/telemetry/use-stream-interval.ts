import { useEffect } from 'react';
import { useConnectionStore } from '@/core/stream/connection-store';
import { marketStream } from '@/core/stream/market-stream';
import { usePreferencesStore } from '@/features/preferences/preferences-store';

const FALLBACK_LIMITS = { minIntervalMs: 10, maxIntervalMs: 1_000 } as const;

/** Re-applies the interval chosen in a previous session once it has been read from disk. */
export function useRestoreStreamInterval(): void {
  useEffect(() => {
    const apply = (): void => {
      const saved = usePreferencesStore.getState().streamIntervalMs;
      if (saved !== null) marketStream.requestInterval(saved);
    };
    if (usePreferencesStore.persist.hasHydrated()) apply();
    return usePreferencesStore.persist.onFinishHydration(apply);
  }, []);
}

export function useStreamInterval() {
  const effectiveMs = useConnectionStore((state) => state.intervalMs);
  const limits = useConnectionStore((state) => state.limits) ?? FALLBACK_LIMITS;
  const savedMs = usePreferencesStore((state) => state.streamIntervalMs);
  const save = usePreferencesStore((state) => state.setStreamInterval);

  const request = (intervalMs: number): void => {
    save(intervalMs);
    marketStream.requestInterval(intervalMs);
  };

  return { intervalMs: effectiveMs ?? savedMs ?? 100, limits, request };
}
