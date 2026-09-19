import type { Encoding, PairSymbol } from '@pulsecrypto/contracts';

/** The subset of a WebSocket the broadcaster depends on, so tests can substitute a fake. */
export interface StreamSocket {
  readonly bufferedAmount: number;
  send(data: string | Uint8Array): void;
  ping(): void;
  close(code: number, reason: string): void;
  terminate(): void;
}

/**
 * Per-connection state. It deliberately holds no outbound queue: only cursors
 * recording the last sequence sent per pair, which keeps a client's memory cost
 * constant regardless of how far behind it falls.
 */
export class ClientSession {
  readonly bookSubscriptions = new Set<PairSymbol>();
  readonly tickerCursors = new Map<PairSymbol, number>();
  readonly bookCursors = new Map<PairSymbol, number>();

  /** Undefined until the client proves who it is; unauthenticated sessions receive nothing. */
  userId: string | undefined;
  authTimer: NodeJS.Timeout | undefined;
  encoding: Encoding = 'json';
  nextDueAt: number;
  lastSentAt: number;
  congestedSince: number | undefined;
  invalidMessages = 0;
  alive = true;

  constructor(
    readonly id: number,
    readonly socket: StreamSocket,
    public intervalMs: number,
    now: number,
  ) {
    this.nextDueAt = now;
    this.lastSentAt = now;
  }
}
