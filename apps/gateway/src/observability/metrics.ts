export interface MetricsSnapshot {
  readonly ingested: number;
  readonly invalidUpstreamMessages: number;
  readonly framesSent: number;
  readonly bytesSent: number;
  readonly ticksSkipped: number;
  readonly evictions: number;
  readonly rejectedClients: number;
  readonly invalidClientMessages: number;
  readonly ingestedPerSecond: number;
  readonly framesPerSecond: number;
}

const SAMPLE_INTERVAL_MS = 1_000;

export class Metrics {
  ingested = 0;
  invalidUpstreamMessages = 0;
  framesSent = 0;
  bytesSent = 0;
  ticksSkipped = 0;
  evictions = 0;
  rejectedClients = 0;
  invalidClientMessages = 0;

  private ingestedPerSecond = 0;
  private framesPerSecond = 0;
  private sampled = { at: 0, ingested: 0, framesSent: 0 };
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  start(): void {
    if (this.timer) return;
    this.sampled = { at: this.now(), ingested: this.ingested, framesSent: this.framesSent };
    this.timer = setInterval(() => {
      this.sample();
    }, SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  sample(): void {
    const at = this.now();
    const seconds = (at - this.sampled.at) / 1_000;
    if (seconds <= 0) return;
    this.ingestedPerSecond = Math.round((this.ingested - this.sampled.ingested) / seconds);
    this.framesPerSecond = Math.round((this.framesSent - this.sampled.framesSent) / seconds);
    this.sampled = { at, ingested: this.ingested, framesSent: this.framesSent };
  }

  snapshot(): MetricsSnapshot {
    return {
      ingested: this.ingested,
      invalidUpstreamMessages: this.invalidUpstreamMessages,
      framesSent: this.framesSent,
      bytesSent: this.bytesSent,
      ticksSkipped: this.ticksSkipped,
      evictions: this.evictions,
      rejectedClients: this.rejectedClients,
      invalidClientMessages: this.invalidClientMessages,
      ingestedPerSecond: this.ingestedPerSecond,
      framesPerSecond: this.framesPerSecond,
    };
  }
}
