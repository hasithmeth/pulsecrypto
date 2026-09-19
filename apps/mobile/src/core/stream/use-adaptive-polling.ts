import { useEffect } from 'react';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { AdaptiveInterval } from './adaptive-interval';
import { useConnectionStore } from './connection-store';
import { frameCoalescer, marketStream } from './market-stream';

const SAMPLE_INTERVAL_MS = 1_000;
const DEFAULT_INTERVAL_MS = 100;

/**
 * While enabled, watches how many frames the UI had to coalesce each second and
 * asks the gateway for a slower or faster cadence accordingly. Turning it off
 * returns to the interval the user chose.
 */
export function useAdaptivePolling(): void {
  const enabled = useUserSettingsStore((state) => state.adaptivePolling);

  useEffect(() => {
    if (!enabled) return;

    const chosenMs = (): number =>
      useUserSettingsStore.getState().streamIntervalMs ?? DEFAULT_INTERVAL_MS;
    let controller: AdaptiveInterval | undefined;
    let previous = { ...frameCoalescer.counters };

    const timer = setInterval(() => {
      const { limits, intervalMs, phase } = useConnectionStore.getState();
      const current = { ...frameCoalescer.counters };
      const commits = current.commits - previous.commits;
      const coalesced = current.coalescedFrames - previous.coalescedFrames;
      previous = current;
      if (phase !== 'open' || !limits || intervalMs === null || commits + coalesced === 0) return;

      controller ??= new AdaptiveInterval(limits);
      const next = controller.next(intervalMs, chosenMs(), coalesced / (commits + coalesced));
      if (next !== intervalMs) marketStream.requestInterval(next);
    }, SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      marketStream.requestInterval(chosenMs());
    };
  }, [enabled]);
}
