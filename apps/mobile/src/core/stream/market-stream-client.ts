import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type HelloMessage,
  type MarketMessage,
  type PairSymbol,
  type UpstreamStatus,
} from '@pulsecrypto/contracts';
import { type Backoff, createBackoff } from './backoff';

export type ConnectionPhase = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'offline';

export interface ConnectionSnapshot {
  readonly phase: ConnectionPhase;
  readonly attempt: number;
  readonly retryAt: number | null;
  readonly upstream: UpstreamStatus | null;
  readonly intervalMs: number | null;
  readonly limits: HelloMessage['limits'] | null;
  readonly latencyMs: number | null;
}

export const INITIAL_CONNECTION: ConnectionSnapshot = {
  phase: 'idle',
  attempt: 0,
  retryAt: null,
  upstream: null,
  intervalMs: null,
  limits: null,
  latencyMs: null,
};

/** The slice of the WebSocket API the client relies on, so tests can drive a fake. */
export interface WebSocketLike {
  readonly readyState: number;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface MarketStreamClientOptions {
  readonly url: string;
  readonly onMarket: (message: MarketMessage) => void;
  readonly onConnection: (snapshot: ConnectionSnapshot) => void;
  readonly createSocket?: (url: string) => WebSocketLike;
  readonly backoff?: Backoff;
  readonly now?: () => number;
  readonly handshakeTimeoutMs?: number;
  readonly silenceTimeoutMs?: number;
  readonly pingIntervalMs?: number;
}

const SOCKET_OPEN = 1;
const WATCHDOG_INTERVAL_MS = 2_000;

/**
 * Owns the gateway connection and nothing else: no React, no stores. It keeps
 * the socket alive across failures, network loss and backgrounding, and treats
 * subscriptions and the requested interval as desired state that is replayed
 * after every reconnect.
 */
export class MarketStreamClient {
  readonly counters = { messages: 0, bytes: 0, malformed: 0 };

  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly backoff: Backoff;
  private readonly now: () => number;
  private readonly handshakeTimeoutMs: number;
  private readonly silenceTimeoutMs: number;
  private readonly pingIntervalMs: number;

  private readonly bookSubscriptions = new Map<PairSymbol, number>();
  private readonly pendingPings = new Map<number, number>();
  private desiredIntervalMs: number | undefined;
  private nextPingId = 1;

  private started = false;
  private foreground = true;
  private online = true;
  private hasOpened = false;
  private lastMessageAt = 0;
  private snapshot = INITIAL_CONNECTION;

  private socket: WebSocketLike | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdogTimer: ReturnType<typeof setInterval> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: MarketStreamClientOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.backoff = options.backoff ?? createBackoff({ baseMs: 500, maxMs: 10_000 });
    this.now = options.now ?? Date.now;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
    this.silenceTimeoutMs = options.silenceTimeoutMs ?? 10_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 5_000;
  }

  start(): void {
    this.started = true;
    this.reconcile();
  }

  stop(): void {
    this.started = false;
    this.reconcile();
  }

  setForeground(foreground: boolean): void {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    this.reconcile();
  }

  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    this.reconcile();
  }

  /** Reference counted, so two screens showing the same pair share one subscription. */
  subscribeBook(pair: PairSymbol): () => void {
    const holders = this.bookSubscriptions.get(pair) ?? 0;
    this.bookSubscriptions.set(pair, holders + 1);
    if (holders === 0) this.send({ type: 'subscribe', channel: 'book', pair });

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.bookSubscriptions.get(pair) ?? 1) - 1;
      if (remaining > 0) {
        this.bookSubscriptions.set(pair, remaining);
        return;
      }
      this.bookSubscriptions.delete(pair);
      this.send({ type: 'unsubscribe', channel: 'book', pair });
    };
  }

  requestInterval(intervalMs: number): void {
    this.desiredIntervalMs = intervalMs;
    this.send({ type: 'configure', intervalMs });
  }

  private reconcile(): void {
    if (!this.started || !this.foreground) {
      this.teardown();
      this.update({
        ...INITIAL_CONNECTION,
        intervalMs: this.snapshot.intervalMs,
        limits: this.snapshot.limits,
      });
      return;
    }
    if (!this.online) {
      this.teardown();
      this.update({ phase: 'offline', attempt: 0, retryAt: null, upstream: null, latencyMs: null });
      return;
    }
    if (this.socket || this.retryTimer) return;
    this.backoff.reset();
    this.connect();
  }

  private connect(): void {
    this.retryTimer = undefined;
    this.update({
      phase: this.hasOpened || this.backoff.attempt > 0 ? 'reconnecting' : 'connecting',
      attempt: this.backoff.attempt,
      retryAt: null,
    });

    const socket = this.createSocket(this.options.url);
    this.socket = socket;
    const isCurrent = (): boolean => this.socket === socket;

    socket.onmessage = (event) => {
      if (isCurrent()) this.handleMessage(event.data);
    };
    socket.onerror = () => {
      if (isCurrent()) this.handleDisconnect();
    };
    socket.onclose = () => {
      if (isCurrent()) this.handleDisconnect();
    };

    this.handshakeTimer = setTimeout(() => {
      if (isCurrent()) this.handleDisconnect();
    }, this.handshakeTimeoutMs);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    this.counters.messages += 1;
    this.counters.bytes += data.length;
    this.lastMessageAt = this.now();

    let message: { type?: unknown };
    try {
      message = JSON.parse(data) as { type?: unknown };
    } catch {
      this.counters.malformed += 1;
      return;
    }

    // Frames come from our own gateway and arrive many times a second, so only
    // the discriminant is checked here; full schema validation would spend the
    // JS thread's budget re-proving what the shared contract already guarantees.
    switch (message.type) {
      case 'market':
        this.options.onMarket(message as MarketMessage);
        return;
      case 'hello':
        this.handleHello(message as HelloMessage);
        return;
      case 'status':
        this.update({ upstream: (message as { upstream: UpstreamStatus }).upstream });
        return;
      case 'configured':
        this.update({ intervalMs: (message as { intervalMs: number }).intervalMs });
        return;
      case 'pong':
        this.handlePong((message as { id: number }).id);
        return;
      case 'error':
        if (__DEV__) console.warn('[stream] gateway rejected a message', message);
        return;
      default:
        this.counters.malformed += 1;
    }
  }

  private handleHello(hello: HelloMessage): void {
    clearTimeout(this.handshakeTimer);
    if (__DEV__ && hello.protocolVersion !== PROTOCOL_VERSION) {
      console.warn(
        `[stream] protocol mismatch: app ${PROTOCOL_VERSION}, gateway ${hello.protocolVersion}`,
      );
    }

    this.hasOpened = true;
    this.backoff.reset();
    this.update({
      phase: 'open',
      attempt: 0,
      retryAt: null,
      upstream: hello.upstream,
      intervalMs: hello.intervalMs,
      limits: hello.limits,
    });

    for (const pair of this.bookSubscriptions.keys()) {
      this.send({ type: 'subscribe', channel: 'book', pair });
    }
    if (this.desiredIntervalMs !== undefined && this.desiredIntervalMs !== hello.intervalMs) {
      this.send({ type: 'configure', intervalMs: this.desiredIntervalMs });
    }

    this.watchdogTimer = setInterval(() => {
      if (this.now() - this.lastMessageAt > this.silenceTimeoutMs) this.handleDisconnect();
    }, WATCHDOG_INTERVAL_MS);
    this.pingTimer = setInterval(() => {
      this.ping();
    }, this.pingIntervalMs);
    this.ping();
  }

  private ping(): void {
    const id = this.nextPingId++;
    this.pendingPings.set(id, this.now());
    this.send({ type: 'ping', id });
  }

  private handlePong(id: number): void {
    const sentAt = this.pendingPings.get(id);
    if (sentAt === undefined) return;
    this.pendingPings.clear();
    this.update({ latencyMs: this.now() - sentAt });
  }

  private handleDisconnect(): void {
    this.dropSocket();
    if (!this.started || !this.foreground || !this.online) return;

    const delayMs = this.backoff.next();
    this.update({
      phase: 'reconnecting',
      attempt: this.backoff.attempt,
      retryAt: this.now() + delayMs,
      upstream: null,
      latencyMs: null,
    });
    this.retryTimer = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private teardown(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.dropSocket();
  }

  private dropSocket(): void {
    clearTimeout(this.handshakeTimer);
    clearInterval(this.watchdogTimer);
    clearInterval(this.pingTimer);
    this.pendingPings.clear();

    const socket = this.socket;
    this.socket = undefined;
    if (!socket) return;
    socket.onmessage = socket.onerror = socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Closing a socket that never opened can throw on some platforms; it is already gone.
    }
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== SOCKET_OPEN || this.snapshot.phase !== 'open') return;
    this.socket.send(JSON.stringify(message));
  }

  private update(patch: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onConnection(this.snapshot);
  }
}
