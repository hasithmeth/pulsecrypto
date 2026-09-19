export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly minMs?: number;
  readonly random?: () => number;
}

export interface Backoff {
  readonly attempt: number;
  next(): number;
  reset(): void;
}

/**
 * Exponential backoff with full jitter above an optional floor, so a fleet of
 * phones does not reconnect in lockstep and no delay is shorter than `minMs`.
 */
export function createBackoff({
  baseMs,
  maxMs,
  minMs = 0,
  random = Math.random,
}: BackoffOptions): Backoff {
  let attempt = 0;
  return {
    get attempt() {
      return attempt;
    },
    next() {
      const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
      attempt += 1;
      return minMs + Math.round(random() * ceiling);
    },
    reset() {
      attempt = 0;
    },
  };
}
