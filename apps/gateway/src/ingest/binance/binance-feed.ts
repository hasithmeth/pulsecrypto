import type { PairSymbol } from '@pulsecrypto/contracts';
import type { FastifyBaseLogger } from 'fastify';
import WebSocket from 'ws';
import { rawDataToString } from '../../lib/raw-data';
import { type Backoff, createBackoff } from '../backoff';
import type { MarketFeed, MarketFeedSink } from '../market-feed';
import { combinedStreamUrl, parseBinanceMessage } from './binance-messages';

export interface BinanceFeedOptions {
  readonly baseUrl: string;
  readonly pairs: readonly PairSymbol[];
  readonly staleAfterMs: number;
  readonly sink: MarketFeedSink;
  readonly logger: FastifyBaseLogger;
  readonly backoff?: Backoff;
  readonly createSocket?: (url: string) => WebSocket;
  readonly now?: () => number;
}

const HANDSHAKE_TIMEOUT_MS = 10_000;

export class BinanceFeed implements MarketFeed {
  private readonly url: string;
  private readonly backoff: Backoff;
  private readonly createSocket: (url: string) => WebSocket;
  private readonly now: () => number;

  private socket: WebSocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private staleTimer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: BinanceFeedOptions) {
    this.url = combinedStreamUrl(options.baseUrl, options.pairs);
    this.backoff = options.backoff ?? createBackoff({ baseMs: 500, maxMs: 15_000 });
    this.createSocket =
      options.createSocket ??
      ((url) => new WebSocket(url, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS }));
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.staleTimer);
    this.detach(this.socket);
    this.socket = undefined;
  }

  private connect(): void {
    const { sink, logger } = this.options;
    sink.onStatus('connecting');

    const socket = this.createSocket(this.url);
    this.socket = socket;
    let live = false;

    socket.on('open', () => {
      logger.info({ streams: this.options.pairs.length * 3 }, 'binance stream connected');
      this.armStaleTimer();
    });

    socket.on('message', (data: WebSocket.RawData) => {
      this.armStaleTimer();
      if (!live) {
        live = true;
        this.backoff.reset();
        sink.onStatus('live');
      }
      this.dispatch(data);
    });

    socket.on('error', (error) => {
      logger.warn({ err: error }, 'binance stream error');
    });

    socket.on('close', (code) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      clearTimeout(this.staleTimer);
      if (this.stopped) return;
      sink.onStatus('down');
      const delayMs = this.backoff.next();
      logger.warn(
        { code, delayMs, attempt: this.backoff.attempt },
        'binance stream closed, reconnecting',
      );
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delayMs);
    });
  }

  private dispatch(data: WebSocket.RawData): void {
    const { sink } = this.options;
    try {
      const event = parseBinanceMessage(rawDataToString(data), this.now());
      switch (event.kind) {
        case 'book':
          sink.onBook(event.pair, event.snapshot);
          break;
        case 'trade':
          sink.onTrade(event.pair, event.price, event.ts);
          break;
        case 'dayStats':
          sink.onDayStats(event.pair, event.stats);
          break;
      }
    } catch (error) {
      sink.onInvalidMessage(error instanceof Error ? error.message : String(error));
    }
  }

  /** A silent socket is indistinguishable from a half-open one, so silence forces a reconnect. */
  private armStaleTimer(): void {
    clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      this.options.logger.warn(
        { staleAfterMs: this.options.staleAfterMs },
        'binance stream went silent, terminating',
      );
      this.socket?.terminate();
    }, this.options.staleAfterMs);
  }

  private detach(socket: WebSocket | undefined): void {
    if (!socket) return;
    socket.removeAllListeners();
    socket.on('error', () => undefined);
    socket.terminate();
  }
}
