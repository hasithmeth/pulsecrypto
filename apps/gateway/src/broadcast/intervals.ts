/** Client intervals snap to this grid so the shared tick can be their exact common divisor. */
export const INTERVAL_QUANTUM_MS = 10;

export function normaliseInterval(requestedMs: number, minMs: number, maxMs: number): number {
  const clamped = Math.min(maxMs, Math.max(minMs, requestedMs));
  const snapped = Math.round(clamped / INTERVAL_QUANTUM_MS) * INTERVAL_QUANTUM_MS;
  return Math.max(INTERVAL_QUANTUM_MS, snapped);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function commonTick(intervalsMs: Iterable<number>): number | undefined {
  let tick: number | undefined;
  for (const interval of intervalsMs) {
    tick = tick === undefined ? interval : gcd(tick, interval);
  }
  return tick;
}
