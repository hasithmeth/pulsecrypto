import type { FastifyBaseLogger } from 'fastify';
import type { StreamSocket } from '../broadcast/client-session';

const noop = (): void => undefined;

export const silentLogger: FastifyBaseLogger = {
  level: 'silent',
  fatal: noop,
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
  silent: noop,
  child: () => silentLogger,
};

export class FakeSocket implements StreamSocket {
  bufferedAmount = 0;
  readonly sent: string[] = [];
  pings = 0;
  terminated = false;
  closed: { code: number; reason: string } | undefined;

  send(data: string): void {
    this.sent.push(data);
  }

  ping(): void {
    this.pings += 1;
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  terminate(): void {
    this.terminated = true;
  }

  messages<T extends { type: string }>(type: T['type']): T[] {
    return this.sent
      .map((frame) => JSON.parse(frame) as T)
      .filter((message) => message.type === type);
  }
}

export class ManualClock {
  constructor(private current = 1_000_000) {}

  readonly now = (): number => this.current;

  advance(ms: number): void {
    this.current += ms;
  }
}
