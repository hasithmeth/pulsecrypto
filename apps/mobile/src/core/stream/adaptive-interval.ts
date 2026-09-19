export interface AdaptiveIntervalOptions {
  readonly minIntervalMs: number;
  readonly maxIntervalMs: number;
}

const STEP_MS = 10;
const BACKOFF_FACTOR = 1.5;
const RECOVERY_FACTOR = 1.25;
const OVERLOAD_SHARE = 0.2;
const HEALTHY_SHARE = 0.05;
const OVERLOADED_SAMPLES_TO_BACK_OFF = 3;
const HEALTHY_SAMPLES_TO_RECOVER = 10;

const snap = (intervalMs: number): number => Math.round(intervalMs / STEP_MS) * STEP_MS;

/**
 * Decides how often the gateway should send, from how well the UI keeps up.
 * The input is the share of received frames that had to be coalesced before
 * React could apply them. Backing off is quick and recovery is slow and
 * stepwise, the same asymmetry congestion control uses, so the interval settles
 * instead of oscillating. It never goes below the interval the user chose.
 */
export class AdaptiveInterval {
  private overloaded = 0;
  private healthy = 0;

  constructor(private readonly options: AdaptiveIntervalOptions) {}

  next(currentMs: number, baseMs: number, coalescedShare: number): number {
    const floor = Math.max(baseMs, this.options.minIntervalMs);

    if (coalescedShare > OVERLOAD_SHARE) {
      this.healthy = 0;
      this.overloaded += 1;
      if (this.overloaded < OVERLOADED_SAMPLES_TO_BACK_OFF) return Math.max(currentMs, floor);
      this.overloaded = 0;
      return Math.min(
        this.options.maxIntervalMs,
        Math.max(snap(currentMs * BACKOFF_FACTOR), currentMs + STEP_MS),
      );
    }

    this.overloaded = 0;
    this.healthy = coalescedShare <= HEALTHY_SHARE ? this.healthy + 1 : 0;
    if (currentMs <= floor) return floor;
    if (this.healthy < HEALTHY_SAMPLES_TO_RECOVER) return currentMs;
    this.healthy = 0;
    return Math.max(floor, snap(currentMs / RECOVERY_FACTOR));
  }

  reset(): void {
    this.overloaded = 0;
    this.healthy = 0;
  }
}
