import { decode } from '@msgpack/msgpack';
import {
  CloseCode,
  PROTOCOL_VERSION,
  type ClientMessage,
  type Encoding,
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
  readonly encoding: Encoding | null;
  readonly limits: HelloMessage['limits'] | null;
  readonly latencyMs: number | null;
  /** The user stopped the stream on purpose, as opposed to it being down. */
  readonly paused: boolean;
}

export const INITIAL_CONNECTION: ConnectionSnapshot = {
  phase: 'idle',
  attempt: 0,
  retryAt: null,
  upstream: null,
  intervalMs: null,
  encoding: null,
  limits: null,
  latencyMs: null,
  paused: false,
};

/** The slice of the WebSocket API the client relies on, so tests can drive a fake. */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType: string;
  onopen: ((event: Event) => void) | null;
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
  /** Read on every connect, so a fresh sign-in is picked up without rebuilding the client. */
  readonly getToken: () => string | null;
  /** The gateway rejected the token; retrying with it would only loop. */
  readonly onUnauthorized: () => void;
  readonly createSocket?: (url: string) => WebSocketLike;
  readonly backoff?: Backoff;
  readonly now?: () => number;
  readonly handshakeTimeoutMs?: number;
  readonly silenceTimeoutMs?: number;
  readonly pingIntervalMs?: number;
}

const SOCKET_OPEN = 1;
const WATCHDOG_INTERVAL_MS = 2_000;

// React Native on iOS fires timers shorter than a second from the display link,
// which stops ticking while the screen is static on a headless simulator; longer
// timers use a native timer and always fire. A retry is the one timer that must
// fire from a completely idle app, so it never waits less than this.
const MIN_RETRY_DELAY_MS = 1_200;

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
  private desiredEncoding: Encoding = 'json';
  private nextPingId = 1;

  private started = false;
  private paused = false;
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
    this.backoff =
      options.backoff ?? createBackoff({ minMs: MIN_RETRY_DELAY_MS, baseMs: 500, maxMs: 10_000 });
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

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
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

  requestEncoding(encoding: Encoding): void {
    this.desiredEncoding = encoding;
    this.send({ type: 'configure', encoding });
  }

  private reconcile(): void {
    if (!this.started || !this.foreground || this.paused) {
      this.teardown();
      this.update({
        ...INITIAL_CONNECTION,
        intervalMs: this.snapshot.intervalMs,
        encoding: this.snapshot.encoding,
        limits: this.snapshot.limits,
        paused: this.started && this.paused,
      });
      return;
    }
    if (!this.online) {
      this.teardown();
      this.update({
        phase: 'offline',
        attempt: 0,
        retryAt: null,
        upstream: null,
        latencyMs: null,
        paused: false,
      });
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
      paused: false,
    });

    const socket = this.createSocket(this.options.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    const isCurrent = (): boolean => this.socket === socket;

    socket.onopen = () => {
      if (!isCurrent()) return;
      const token = this.options.getToken();
      if (token === null) {
        this.options.onUnauthorized();
        return;
      }
      socket.send(JSON.stringify({ type: 'auth', token } satisfies ClientMessage));
    };
    socket.onmessage = (event) => {
      if (isCurrent()) this.handleMessage(event.data);
    };
    socket.onerror = () => {
      if (isCurrent()) this.handleDisconnect();
    };
    socket.onclose = (event) => {
      if (!isCurrent()) return;
      if (event.code === CloseCode.Unauthorized) {
        this.dropSocket();
        this.options.onUnauthorized();
        return;
      }
      this.handleDisconnect();
    };

    this.handshakeTimer = setTimeout(() => {
      if (isCurrent()) this.handleDisconnect();
    }, this.handshakeTimeoutMs);
  }

  /** Text frames are JSON and binary frames are MessagePack, so no negotiation state is needed to decode. */
  private handleMessage(data: unknown): void {
    const binary = data instanceof ArrayBuffer;
    if (!binary && typeof data !== 'string') return;
    this.counters.messages += 1;
    this.counters.bytes += binary ? data.byteLength : data.length;
    this.lastMessageAt = this.now();

    let message: { type?: unknown };
    try {
      message = (binary ? decode(new Uint8Array(data)) : JSON.parse(data)) as { type?: unknown };
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
      case 'configured': {
        const { intervalMs, encoding } = message as { intervalMs: number; encoding: Encoding };
        this.update({ intervalMs, encoding });
        return;
      }
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
      encoding: hello.encoding,
      limits: hello.limits,
    });

    for (const pair of this.bookSubscriptions.keys()) {
      this.send({ type: 'subscribe', channel: 'book', pair });
    }
    const intervalMs =
      this.desiredIntervalMs !== undefined && this.desiredIntervalMs !== hello.intervalMs
        ? this.desiredIntervalMs
        : undefined;
    const encoding = this.desiredEncoding !== hello.encoding ? this.desiredEncoding : undefined;
    if (intervalMs !== undefined || encoding !== undefined) {
      this.send({ type: 'configure', intervalMs, encoding });
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
    if (!this.started || !this.foreground || !this.online || this.paused) return;

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
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
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
