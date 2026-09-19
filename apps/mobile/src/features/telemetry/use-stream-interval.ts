import { useConnectionStore } from '@/core/stream/connection-store';
import { marketStream } from '@/core/stream/market-stream';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';

const FALLBACK_LIMITS = { minIntervalMs: 10, maxIntervalMs: 1_000 } as const;
const DEFAULT_INTERVAL_MS = 100;

/**
 * `chosenMs` is what the user set and is saved with their account. `effectiveMs`
 * is what the gateway acknowledged, which can be higher while adaptive polling
 * is backing off.
 */
export function useStreamInterval() {
  const effectiveMs = useConnectionStore((state) => state.intervalMs);
  const limits = useConnectionStore((state) => state.limits) ?? FALLBACK_LIMITS;
  const savedMs = useUserSettingsStore((state) => state.streamIntervalMs);
  const save = useUserSettingsStore((state) => state.setStreamInterval);

  const choose = (intervalMs: number): void => {
    save(intervalMs);
    marketStream.requestInterval(intervalMs);
  };

  return {
    chosenMs: savedMs ?? DEFAULT_INTERVAL_MS,
    effectiveMs: effectiveMs ?? savedMs ?? DEFAULT_INTERVAL_MS,
    limits,
    choose,
  };
}
