import { EventEmitter } from 'node:events';
import type { UpstreamStatus } from '@pulsecrypto/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { silentLogger } from '../../testing/fakes';
import type { MarketFeedSink } from '../market-feed';
import { BinanceFeed } from './binance-feed';

class FakeUpstream extends EventEmitter {
  terminated = false;

  terminate(): void {
    this.terminated = true;
    this.emit('close', 1006);
  }
}

function setup() {
  const sockets: FakeUpstream[] = [];
  const statuses: UpstreamStatus[] = [];
  const sink = {
    onTrade: vi.fn(),
    onDayStats: vi.fn(),
    onBook: vi.fn(),
    onStatus: (status: UpstreamStatus) => statuses.push(status),
    onInvalidMessage: vi.fn(),
  } satisfies MarketFeedSink;

  const feed = new BinanceFeed({
    baseUrl: 'wss://example.test',
    pairs: ['BTCUSDT'],
    staleAfterMs: 10_000,
    sink,
    logger: silentLogger,
    backoff: { attempt: 0, next: () => 1_000, reset: vi.fn() },
    createSocket: () => {
      const socket = new FakeUpstream();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    now: () => 42,
  });

  const trade = Buffer.from(
    JSON.stringify({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', E: 1, p: '100.5' } }),
  );

  return { feed, sockets, statuses, sink, trade };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BinanceFeed', () => {
  it('reports live only once data flows, and forwards parsed events', () => {
    const { feed, sockets, statuses, sink, trade } = setup();
    feed.start();
    sockets[0]?.emit('open');
    expect(statuses).toEqual(['connecting']);

    sockets[0]?.emit('message', trade);

    expect(statuses).toEqual(['connecting', 'live']);
    expect(sink.onTrade).toHaveBeenCalledWith('BTCUSDT', 100.5, 1);
    feed.stop();
  });

  it('counts unparseable messages without disturbing the stream', () => {
    const { feed, sockets, sink } = setup();
    feed.start();
    sockets[0]?.emit('message', Buffer.from('{"result":null,"id":1}'));

    expect(sink.onInvalidMessage).toHaveBeenCalledOnce();
    expect(sink.onTrade).not.toHaveBeenCalled();
    feed.stop();
  });

  it('reconnects after the backoff delay when the connection drops', () => {
    const { feed, sockets, statuses } = setup();
    feed.start();
    sockets[0]?.emit('close', 1006);
    expect(statuses).toEqual(['connecting', 'down']);

    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    expect(statuses.at(-1)).toBe('connecting');
    feed.stop();
  });

  it('treats prolonged silence as a dead link and reconnects', () => {
    const { feed, sockets, trade } = setup();
    feed.start();
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', trade);

    vi.advanceTimersByTime(10_000);
    expect(sockets[0]?.terminated).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    feed.stop();
  });

  it('does not reconnect once stopped', () => {
    const { feed, sockets } = setup();
    feed.start();
    feed.stop();

    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
