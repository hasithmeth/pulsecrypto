import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useConnectionStore } from '@/core/stream/connection-store';
import { frameCoalescer, marketStream } from '@/core/stream/market-stream';

export interface TelemetrySample {
  readonly fps: number;
  readonly messagesPerSecond: number;
  readonly commitsPerSecond: number;
  readonly coalescedPerSecond: number;
  readonly heapMegabytes: number | null;
  /** Recent heap readings, oldest first, for the memory graph. */
  readonly heapHistory: readonly number[];
  readonly averagePingMs: number | null;
  readonly storageBytes: number | null;
}

const EMPTY_SAMPLE: TelemetrySample = {
  fps: 0,
  messagesPerSecond: 0,
  commitsPerSecond: 0,
  coalescedPerSecond: 0,
  heapMegabytes: null,
  heapHistory: [],
  averagePingMs: null,
  storageBytes: null,
};

const SAMPLE_INTERVAL_MS = 1_000;
const HISTORY_LENGTH = 11;
const PING_WINDOW = 10;

const readCounters = () => ({
  messages: marketStream.counters.messages,
  commits: frameCoalescer.counters.commits,
  coalesced: frameCoalescer.counters.coalescedFrames,
});

function readHeapMegabytes(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  return memory?.usedJSHeapSize ? memory.usedJSHeapSize / 1_048_576 : null;
}

async function measureStorageBytes(): Promise<number> {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  return entries.reduce((total, [key, value]) => total + key.length + (value?.length ?? 0), 0);
}

const average = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/**
 * Samples once a second, and only while the screen is focused, so measuring the
 * app does not tax it the rest of the time. Frame rate counts
 * requestAnimationFrame callbacks, which reflects how often the JS thread is
 * free to run.
 */
export function useTelemetry(): { sample: TelemetrySample; reset: () => void } {
  const [sample, setSample] = useState(EMPTY_SAMPLE);

  useFocusEffect(
    useCallback(() => {
      let frames = 0;
      let frameHandle = requestAnimationFrame(function countFrame() {
        frames += 1;
        frameHandle = requestAnimationFrame(countFrame);
      });

      let previous = readCounters();
      let previousAt = Date.now();
      const pings: number[] = [];
      let lastPing: number | null = null;

      void measureStorageBytes().then((storageBytes) => {
        setSample((last) => ({ ...last, storageBytes }));
      });

      const timer = setInterval(() => {
        const now = Date.now();
        const seconds = (now - previousAt) / 1_000;
        const current = readCounters();
        const rate = (key: keyof typeof current): number =>
          Math.round((current[key] - previous[key]) / seconds);

        const ping = useConnectionStore.getState().latencyMs;
        if (ping !== null && ping !== lastPing) {
          lastPing = ping;
          pings.push(ping);
          if (pings.length > PING_WINDOW) pings.shift();
        }

        // Computed eagerly: a state updater runs later, after the baseline below has moved on.
        const heapMegabytes = readHeapMegabytes();
        const measured = {
          fps: Math.round(frames / seconds),
          messagesPerSecond: rate('messages'),
          commitsPerSecond: rate('commits'),
          coalescedPerSecond: rate('coalesced'),
          heapMegabytes,
          averagePingMs: average(pings),
        };
        setSample((last) => ({
          ...last,
          ...measured,
          heapHistory:
            heapMegabytes === null
              ? last.heapHistory
              : [...last.heapHistory, heapMegabytes].slice(-HISTORY_LENGTH),
        }));

        frames = 0;
        previous = current;
        previousAt = now;
      }, SAMPLE_INTERVAL_MS);

      return () => {
        cancelAnimationFrame(frameHandle);
        clearInterval(timer);
      };
    }, []),
  );

  const reset = (): void => {
    setSample((last) => ({ ...last, heapHistory: [] }));
  };

  return { sample, reset };
}
