import {
  ClientMessageSchema,
  CloseCode,
  PROTOCOL_VERSION,
  type ErrorCode,
  type PairSymbol,
  type ServerMessage,
  type UpstreamStatus,
} from '@pulsecrypto/contracts';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config/env';
import type { Metrics } from '../observability/metrics';
import { ClientSession, type StreamSocket } from './client-session';
import type { Fragment, FrameEncoder } from './frame-encoder';
import { commonTick, INTERVAL_QUANTUM_MS, normaliseInterval } from './intervals';

export interface BroadcasterOptions {
  readonly pairs: readonly PairSymbol[];
  readonly encoder: FrameEncoder;
  readonly metrics: Metrics;
  readonly logger: FastifyBaseLogger;
  readonly broadcast: Config['broadcast'];
  readonly clients: Config['clients'];
  /** Resolves a bearer token to a user id, or undefined when it is invalid or expired. */
  readonly authenticate: (token: string) => string | undefined;
  readonly now?: () => number;
}

const DUE_TOLERANCE_MS = INTERVAL_QUANTUM_MS / 2;

export class Broadcaster {
  private readonly sessions = new Set<ClientSession>();
  private readonly pairs: ReadonlySet<PairSymbol>;
  private readonly now: () => number;

  private upstream: UpstreamStatus = 'connecting';
  private tickTimer: NodeJS.Timeout | undefined;
  private tickMs: number | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private nextSessionId = 1;

  constructor(private readonly options: BroadcasterOptions) {
    this.pairs = new Set(options.pairs);
    this.now = options.now ?? Date.now;
  }

  get clientCount(): number {
    return this.sessions.size;
  }

  get upstreamStatus(): UpstreamStatus {
    return this.upstream;
  }

  start(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      this.checkLiveness();
    }, this.options.clients.pingIntervalMs);
  }

  stop(): void {
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    for (const session of [...this.sessions]) {
      session.socket.close(CloseCode.ServerShutdown, 'server shutting down');
      this.disconnect(session);
    }
  }

  connect(socket: StreamSocket): ClientSession | undefined {
    const { clients, broadcast, metrics, logger } = this.options;
    if (this.sessions.size >= clients.maxClients) {
      metrics.rejectedClients += 1;
      socket.close(CloseCode.ServerFull, 'server full');
      return undefined;
    }

    const session = new ClientSession(
      this.nextSessionId++,
      socket,
      broadcast.defaultIntervalMs,
      this.now(),
    );
    this.sessions.add(session);
    session.authTimer = setTimeout(() => {
      this.rejectUnauthenticated(session, 'authentication timed out');
    }, clients.authDeadlineMs);
    logger.info({ client: session.id, clients: this.sessions.size }, 'client connected');
    return session;
  }

  disconnect(session: ClientSession): void {
    if (!this.sessions.delete(session)) return;
    clearTimeout(session.authTimer);
    this.reschedule();
    this.options.logger.info(
      { client: session.id, clients: this.sessions.size },
      'client disconnected',
    );
  }

  receive(session: ClientSession, raw: string): void {
    const parsed = ClientMessageSchema.safeParse(safeJsonParse(raw));
    if (!parsed.success) {
      this.rejectMessage(session, 'invalid_message', 'Message does not match the protocol');
      return;
    }

    const message = parsed.data;
    if (session.userId === undefined) {
      if (message.type === 'auth') this.authenticate(session, message.token);
      else this.rejectUnauthenticated(session, 'authenticate first');
      return;
    }

    switch (message.type) {
      case 'auth':
        return;

      case 'subscribe':
        if (!this.pairs.has(message.pair)) {
          this.rejectMessage(session, 'unknown_pair', `Unknown pair ${message.pair}`);
          return;
        }
        session.bookSubscriptions.add(message.pair);
        session.bookCursors.delete(message.pair);
        session.nextDueAt = this.now();
        return;

      case 'unsubscribe':
        session.bookSubscriptions.delete(message.pair);
        session.bookCursors.delete(message.pair);
        return;

      case 'configure': {
        const { minIntervalMs, maxIntervalMs } = this.options.broadcast;
        if (message.intervalMs !== undefined) {
          session.intervalMs = normaliseInterval(message.intervalMs, minIntervalMs, maxIntervalMs);
          session.nextDueAt = this.now() + session.intervalMs;
        }
        session.encoding = message.encoding ?? session.encoding;
        this.sendControl(session, {
          type: 'configured',
          intervalMs: session.intervalMs,
          encoding: session.encoding,
        });
        this.reschedule();
        return;
      }

      case 'ping':
        this.sendControl(session, { type: 'pong', id: message.id, serverTime: this.now() });
        return;
    }
  }

  markAlive(session: ClientSession): void {
    session.alive = true;
  }

  setUpstreamStatus(status: UpstreamStatus): void {
    if (status === this.upstream) return;
    this.upstream = status;
    for (const session of this.sessions) {
      if (session.userId !== undefined)
        this.sendControl(session, { type: 'status', upstream: status });
    }
  }

  /** Visible for tests; production code is driven by the internal timer. */
  tick(): void {
    const now = this.now();
    for (const session of this.sessions) {
      if (session.userId !== undefined && now + DUE_TOLERANCE_MS >= session.nextDueAt) {
        this.flush(session, now);
      }
    }
  }

  private flush(session: ClientSession, now: number): void {
    session.nextDueAt = now + session.intervalMs;

    if (this.isCongested(session, now)) return;

    const { encoder, clients } = this.options;
    const tickers: Fragment[] = [];
    const books: Fragment[] = [];
    const advanced: [Map<PairSymbol, number>, PairSymbol, number][] = [];

    for (const pair of this.pairs) {
      const fragment = encoder.ticker(pair);
      if (fragment && fragment.seq !== session.tickerCursors.get(pair)) {
        tickers.push(fragment);
        advanced.push([session.tickerCursors, pair, fragment.seq]);
      }
    }
    for (const pair of session.bookSubscriptions) {
      const fragment = encoder.book(pair);
      if (fragment && fragment.seq !== session.bookCursors.get(pair)) {
        books.push(fragment);
        advanced.push([session.bookCursors, pair, fragment.seq]);
      }
    }

    if (advanced.length === 0) {
      if (now - session.lastSentAt >= clients.heartbeatMs) {
        this.sendControl(session, { type: 'status', upstream: this.upstream });
      }
      return;
    }

    if (!this.send(session, encoder.marketFrame(session.encoding, now, tickers, books))) return;
    for (const [cursors, pair, seq] of advanced) cursors.set(pair, seq);
  }

  /**
   * Slow-consumer policy. A congested client simply misses ticks: its cursors do
   * not advance, so once it drains it receives the newest state rather than a
   * backlog. A client that stays congested, or whose socket buffer passes the
   * hard limit, is dropped so it can never grow the process without bound.
   */
  private isCongested(session: ClientSession, now: number): boolean {
    const { clients, metrics } = this.options;
    const buffered = session.socket.bufferedAmount;

    if (buffered <= clients.highWatermarkBytes) {
      session.congestedSince = undefined;
      return false;
    }

    metrics.ticksSkipped += 1;
    session.congestedSince ??= now;
    const congestedForMs = now - session.congestedSince;
    if (buffered > clients.hardLimitBytes || congestedForMs >= clients.maxCongestionMs) {
      this.evict(session, { buffered, congestedForMs });
    }
    return true;
  }

  private authenticate(session: ClientSession, token: string): void {
    const userId = this.options.authenticate(token);
    if (userId === undefined) {
      this.rejectUnauthenticated(session, 'invalid or expired token');
      return;
    }

    const { broadcast } = this.options;
    clearTimeout(session.authTimer);
    session.userId = userId;
    session.nextDueAt = this.now();
    this.sendControl(session, {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      serverTime: this.now(),
      intervalMs: session.intervalMs,
      encoding: session.encoding,
      limits: { minIntervalMs: broadcast.minIntervalMs, maxIntervalMs: broadcast.maxIntervalMs },
      pairs: [...this.pairs],
      upstream: this.upstream,
    });
    this.reschedule();
  }

  private rejectUnauthenticated(session: ClientSession, reason: string): void {
    this.options.metrics.rejectedClients += 1;
    session.socket.close(CloseCode.Unauthorized, reason);
    this.disconnect(session);
  }

  private evict(session: ClientSession, details: Record<string, number>): void {
    this.options.metrics.evictions += 1;
    this.options.logger.warn({ client: session.id, ...details }, 'evicting slow consumer');
    session.socket.terminate();
    this.disconnect(session);
  }

  private rejectMessage(session: ClientSession, code: ErrorCode, message: string): void {
    this.options.metrics.invalidClientMessages += 1;
    session.invalidMessages += 1;
    if (session.invalidMessages >= this.options.clients.maxInvalidMessages) {
      session.socket.close(CloseCode.ProtocolViolation, 'too many invalid messages');
      this.disconnect(session);
      return;
    }
    this.sendControl(session, { type: 'error', code, message });
  }

  private sendControl(session: ClientSession, message: ServerMessage): void {
    if (session.socket.bufferedAmount > this.options.clients.hardLimitBytes) return;
    this.send(session, JSON.stringify(message));
  }

  private send(session: ClientSession, frame: string | Uint8Array): boolean {
    try {
      session.socket.send(frame);
    } catch (error) {
      this.options.logger.warn({ client: session.id, err: error }, 'send failed, dropping client');
      session.socket.terminate();
      this.disconnect(session);
      return false;
    }
    session.lastSentAt = this.now();
    this.options.metrics.framesSent += 1;
    this.options.metrics.bytesSent +=
      typeof frame === 'string' ? Buffer.byteLength(frame) : frame.byteLength;
    return true;
  }

  private checkLiveness(): void {
    for (const session of [...this.sessions]) {
      if (!session.alive) {
        this.options.logger.info({ client: session.id }, 'client missed heartbeat, terminating');
        session.socket.terminate();
        this.disconnect(session);
        continue;
      }
      session.alive = false;
      session.socket.ping();
    }
  }

  /** The shared timer runs at the GCD of active intervals, and not at all without clients. */
  private reschedule(): void {
    const authenticated = [...this.sessions].filter((session) => session.userId !== undefined);
    const tickMs = commonTick(authenticated.map((session) => session.intervalMs));
    if (tickMs === this.tickMs) return;
    clearInterval(this.tickTimer);
    this.tickMs = tickMs;
    this.tickTimer =
      tickMs === undefined
        ? undefined
        : setInterval(() => {
            this.tick();
          }, tickMs);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
