import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { frameCoalescer, marketStream } from '@/core/stream/market-stream';

export interface TelemetrySample {
  readonly fps: number;
  readonly lowestFps: number | null;
  readonly eventLoopLagMs: number;
  readonly messagesPerSecond: number;
  readonly kilobytesPerSecond: number;
  readonly commitsPerSecond: number;
  readonly coalescedPerSecond: number;
  readonly heapMegabytes: number | null;
}

const EMPTY_SAMPLE: TelemetrySample = {
  fps: 0,
  lowestFps: null,
  eventLoopLagMs: 0,
  messagesPerSecond: 0,
  kilobytesPerSecond: 0,
  commitsPerSecond: 0,
  coalescedPerSecond: 0,
  heapMegabytes: null,
};

const SAMPLE_INTERVAL_MS = 1_000;
const LAG_PROBE_INTERVAL_MS = 50;

const readCounters = () => ({
  messages: marketStream.counters.messages,
  bytes: marketStream.counters.bytes,
  commits: frameCoalescer.counters.commits,
  coalesced: frameCoalescer.counters.coalescedFrames,
});

function readHeapMegabytes(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
  return memory?.usedJSHeapSize ? memory.usedJSHeapSize / 1_048_576 : null;
}

/**
 * Samples once a second, and only while the screen is focused, so measuring the
 * app does not tax it the rest of the time.
 *
 * Two signals are kept apart on purpose. Frame rate (requestAnimationFrame) is
 * capped by the device's display pipeline, so a slow emulator reads low even when
 * idle. Event-loop lag (how late a timer fires) isolates the JS thread: it only
 * grows when our own work is starving it.
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

      let worstLagMs = 0;
      let probeDueAt = Date.now() + LAG_PROBE_INTERVAL_MS;
      const lagProbe = setInterval(() => {
        const now = Date.now();
        worstLagMs = Math.max(worstLagMs, now - probeDueAt);
        probeDueAt = now + LAG_PROBE_INTERVAL_MS;
      }, LAG_PROBE_INTERVAL_MS);

      let previous = readCounters();
      let previousAt = Date.now();

      const timer = setInterval(() => {
        const now = Date.now();
        const seconds = (now - previousAt) / 1_000;
        const current = readCounters();
        const rate = (key: keyof typeof current): number =>
          Math.round((current[key] - previous[key]) / seconds);

        // Computed eagerly: a state updater runs later, after the baseline below has moved on.
        const measured = {
          fps: Math.round(frames / seconds),
          eventLoopLagMs: Math.max(0, Math.round(worstLagMs)),
          messagesPerSecond: rate('messages'),
          kilobytesPerSecond: Math.round((rate('bytes') / 1_024) * 10) / 10,
          commitsPerSecond: rate('commits'),
          coalescedPerSecond: rate('coalesced'),
          heapMegabytes: readHeapMegabytes(),
        };
        setSample((last) => ({
          ...measured,
          lowestFps:
            last.lowestFps === null ? measured.fps : Math.min(last.lowestFps, measured.fps),
        }));

        frames = 0;
        worstLagMs = 0;
        previous = current;
        previousAt = now;
      }, SAMPLE_INTERVAL_MS);

      return () => {
        cancelAnimationFrame(frameHandle);
        clearInterval(timer);
        clearInterval(lagProbe);
      };
    }, []),
  );

  const reset = (): void => {
    setSample((last) => ({ ...last, lowestFps: null }));
  };

  return { sample, reset };
}
