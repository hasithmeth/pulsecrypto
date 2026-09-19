export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
  readonly random?: () => number;
}

export interface Backoff {
  readonly attempt: number;
  next(): number;
  reset(): void;
}

/** Exponential backoff with full jitter: a uniform delay in [0, min(max, base * 2^attempt)]. */
export function createBackoff({ baseMs, maxMs, random = Math.random }: BackoffOptions): Backoff {
  let attempt = 0;
  return {
    get attempt() {
      return attempt;
    },
    next() {
      const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
      attempt += 1;
      return Math.round(random() * ceiling);
    },
    reset() {
      attempt = 0;
    },
  };
}
