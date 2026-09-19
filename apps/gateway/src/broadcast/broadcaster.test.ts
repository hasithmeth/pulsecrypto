import type {
  ConfiguredMessage,
  ErrorMessage,
  HelloMessage,
  MarketMessage,
  PongMessage,
  StatusMessage,
} from '@pulsecrypto/contracts';
import { CloseCode } from '@pulsecrypto/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/env';
import { MarketState } from '../domain/market-state';
import { PairRegistry } from '../domain/pairs';
import { Metrics } from '../observability/metrics';
import { FakeSocket, ManualClock, silentLogger } from '../testing/fakes';
import { Broadcaster } from './broadcaster';
import { FrameEncoder } from './frame-encoder';

const PAIRS = ['BTCUSDT', 'ETHUSDT'];

const clientLimits: Config['clients'] = {
  maxClients: 2,
  highWatermarkBytes: 1_000,
  hardLimitBytes: 10_000,
  maxCongestionMs: 500,
  heartbeatMs: 3_000,
  pingIntervalMs: 15_000,
  maxInvalidMessages: 3,
};

function setup(overrides: Partial<Config['clients']> = {}) {
  const clock = new ManualClock();
  const registry = new PairRegistry(PAIRS);
  const state = new MarketState(registry.symbols);
  const metrics = new Metrics(clock.now);
  const broadcaster = new Broadcaster({
    pairs: registry.symbols,
    encoder: new FrameEncoder(state, registry, 20),
    metrics,
    logger: silentLogger,
    broadcast: { defaultIntervalMs: 100, minIntervalMs: 10, maxIntervalMs: 1_000, bookDepth: 20 },
    clients: { ...clientLimits, ...overrides },
    now: clock.now,
  });

  let updateId = 0;
  const publish = (pair: string, price: number): void => {
    updateId += 1;
    state.applyDayStats(pair, {
      eventTime: clock.now(),
      lastPrice: price,
      changePct: 1,
      high: price + 10,
      low: price - 10,
      volume: 1_000,
    });
    state.applyBook(pair, {
      lastUpdateId: updateId,
      receivedAt: clock.now(),
      bids: [[price - 0.5, 2]],
      asks: [[price + 0.5, 1]],
    });
  };

  const advance = (ms: number): void => {
    clock.advance(ms);
    broadcaster.tick();
  };

  return { broadcaster, clock, metrics, publish, advance };
}

const marketFrames = (socket: FakeSocket): MarketMessage[] =>
  socket.messages<MarketMessage>('market');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Broadcaster', () => {
  it('greets a new client with the protocol and its limits', () => {
    const { broadcaster } = setup();
    const socket = new FakeSocket();

    broadcaster.connect(socket);

    expect(socket.messages<HelloMessage>('hello')).toEqual([
      expect.objectContaining({
        protocolVersion: 1,
        intervalMs: 100,
        limits: { minIntervalMs: 10, maxIntervalMs: 1_000 },
        pairs: PAIRS,
        upstream: 'connecting',
      }),
    ]);
  });

  it('conflates bursts into one frame per interval carrying only the latest state', () => {
    const { broadcaster, publish, advance } = setup();
    const socket = new FakeSocket();
    broadcaster.connect(socket);

    for (let price = 1; price <= 500; price += 1) publish('BTCUSDT', price);
    advance(100);

    const frames = marketFrames(socket);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.tickers).toEqual([expect.objectContaining({ pair: 'BTCUSDT', price: 500 })]);
  });

  it('sends only pairs that changed since the client last heard about them', () => {
    const { broadcaster, publish, advance } = setup();
    const socket = new FakeSocket();
    broadcaster.connect(socket);

    publish('BTCUSDT', 100);
    publish('ETHUSDT', 10);
    advance(100);
    publish('ETHUSDT', 11);
    advance(100);
    advance(100);

    const frames = marketFrames(socket);
    expect(frames).toHaveLength(2);
    expect(frames[1]?.tickers.map((ticker) => ticker.pair)).toEqual(['ETHUSDT']);
  });

  it('streams order books only for subscribed pairs', () => {
    const { broadcaster, publish, advance } = setup();
    const socket = new FakeSocket();
    const session = broadcaster.connect(socket);
    if (!session) throw new Error('expected a session');

    publish('BTCUSDT', 100);
    publish('ETHUSDT', 10);
    advance(100);
    expect(marketFrames(socket)[0]?.books).toEqual([]);

    broadcaster.receive(
      session,
      JSON.stringify({ type: 'subscribe', channel: 'book', pair: 'BTCUSDT' }),
    );
    advance(0);
    const [book] = marketFrames(socket).at(-1)?.books ?? [];
    expect(book).toMatchObject({
      pair: 'BTCUSDT',
      spread: 1,
      buyPressure: 66.7,
      sellPressure: 33.3,
    });

    broadcaster.receive(
      session,
      JSON.stringify({ type: 'unsubscribe', channel: 'book', pair: 'BTCUSDT' }),
    );
    publish('BTCUSDT', 101);
    advance(100);
    expect(marketFrames(socket).at(-1)?.books).toEqual([]);
  });

  it('honours a per-client interval, clamped and snapped by the server', () => {
    const { broadcaster, publish, advance } = setup();
    const fast = new FakeSocket();
    const slow = new FakeSocket();
    broadcaster.connect(fast);
    const slowSession = broadcaster.connect(slow);
    if (!slowSession) throw new Error('expected a session');

    broadcaster.receive(slowSession, JSON.stringify({ type: 'configure', intervalMs: 254 }));
    expect(slow.messages<ConfiguredMessage>('configured')).toEqual([
      { type: 'configured', intervalMs: 250 },
    ]);

    for (let elapsed = 50; elapsed <= 500; elapsed += 50) {
      publish('BTCUSDT', elapsed);
      advance(50);
    }

    expect(marketFrames(fast)).toHaveLength(5);
    expect(marketFrames(slow)).toHaveLength(2);
    expect(marketFrames(slow).at(-1)?.tickers[0]?.price).toBe(500);
  });

  it('runs its timer at the common tick and stops it when the last client leaves', () => {
    const { broadcaster, publish } = setup();
    const socket = new FakeSocket();
    const session = broadcaster.connect(socket);
    if (!session) throw new Error('expected a session');
    expect(vi.getTimerCount()).toBe(1);

    publish('BTCUSDT', 100);
    vi.advanceTimersByTime(100);
    expect(marketFrames(socket)).toHaveLength(1);

    broadcaster.disconnect(session);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('slow consumers', () => {
    it('skips ticks while the socket is congested, then resumes with the newest state', () => {
      const { broadcaster, publish, advance, metrics } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);

      socket.bufferedAmount = 5_000;
      for (let price = 1; price <= 3; price += 1) {
        publish('BTCUSDT', price);
        advance(100);
      }
      expect(marketFrames(socket)).toHaveLength(0);
      expect(metrics.ticksSkipped).toBe(3);

      socket.bufferedAmount = 0;
      advance(100);
      const frames = marketFrames(socket);
      expect(frames).toHaveLength(1);
      expect(frames[0]?.tickers[0]?.price).toBe(3);
    });

    it('evicts a client that stays congested beyond the allowed window', () => {
      const { broadcaster, publish, advance, metrics } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);
      socket.bufferedAmount = 5_000;

      for (let elapsed = 0; elapsed <= 600; elapsed += 100) {
        publish('BTCUSDT', elapsed);
        advance(100);
      }

      expect(socket.terminated).toBe(true);
      expect(broadcaster.clientCount).toBe(0);
      expect(metrics.evictions).toBe(1);
    });

    it('evicts immediately once the hard buffer limit is crossed', () => {
      const { broadcaster, publish, advance } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);

      socket.bufferedAmount = 10_001;
      publish('BTCUSDT', 1);
      advance(100);

      expect(socket.terminated).toBe(true);
      expect(socket.sent.filter((frame) => frame.includes('"market"'))).toHaveLength(0);
    });

    it('never buffers on behalf of a client, however long it stalls', () => {
      const { broadcaster, publish, advance } = setup({ maxCongestionMs: Number.MAX_SAFE_INTEGER });
      const socket = new FakeSocket();
      broadcaster.connect(socket);
      socket.bufferedAmount = 5_000;
      const sentBefore = socket.sent.length;

      for (let i = 0; i < 1_000; i += 1) {
        publish('BTCUSDT', i);
        advance(100);
      }

      expect(socket.sent).toHaveLength(sentBefore);
    });
  });

  describe('protocol handling', () => {
    it('answers pings so clients can measure round-trip time', () => {
      const { broadcaster } = setup();
      const socket = new FakeSocket();
      const session = broadcaster.connect(socket);
      if (!session) throw new Error('expected a session');

      broadcaster.receive(session, JSON.stringify({ type: 'ping', id: 7 }));

      expect(socket.messages<PongMessage>('pong')).toEqual([
        expect.objectContaining({ type: 'pong', id: 7 }),
      ]);
    });

    it('rejects unknown pairs and malformed messages, then closes repeat offenders', () => {
      const { broadcaster } = setup();
      const socket = new FakeSocket();
      const session = broadcaster.connect(socket);
      if (!session) throw new Error('expected a session');

      broadcaster.receive(
        session,
        JSON.stringify({ type: 'subscribe', channel: 'book', pair: 'NOPEUSDT' }),
      );
      broadcaster.receive(session, 'not json');
      expect(socket.messages<ErrorMessage>('error').map((error) => error.code)).toEqual([
        'unknown_pair',
        'invalid_message',
      ]);

      broadcaster.receive(session, '{}');
      expect(socket.closed?.code).toBe(CloseCode.ProtocolViolation);
      expect(broadcaster.clientCount).toBe(0);
    });

    it('refuses connections beyond the client limit', () => {
      const { broadcaster, metrics } = setup();
      broadcaster.connect(new FakeSocket());
      broadcaster.connect(new FakeSocket());
      const rejected = new FakeSocket();

      expect(broadcaster.connect(rejected)).toBeUndefined();
      expect(rejected.closed?.code).toBe(CloseCode.ServerFull);
      expect(metrics.rejectedClients).toBe(1);
    });
  });

  describe('liveness', () => {
    it('pushes upstream status changes to every client', () => {
      const { broadcaster } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);

      broadcaster.setUpstreamStatus('live');
      broadcaster.setUpstreamStatus('live');
      broadcaster.setUpstreamStatus('down');

      expect(socket.messages<StatusMessage>('status').map((status) => status.upstream)).toEqual([
        'live',
        'down',
      ]);
    });

    it('sends a heartbeat when the market is quiet so clients can detect dead links', () => {
      const { broadcaster, advance } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);

      for (let elapsed = 0; elapsed < 3_000; elapsed += 100) advance(100);

      expect(socket.messages<StatusMessage>('status')).toHaveLength(1);
    });

    it('terminates clients that stop answering protocol pings', () => {
      const { broadcaster } = setup();
      const responsive = new FakeSocket();
      const silent = new FakeSocket();
      const responsiveSession = broadcaster.connect(responsive);
      broadcaster.connect(silent);
      if (!responsiveSession) throw new Error('expected a session');
      broadcaster.start();

      vi.advanceTimersByTime(15_000);
      broadcaster.markAlive(responsiveSession);
      vi.advanceTimersByTime(15_000);

      expect(silent.terminated).toBe(true);
      expect(responsive.terminated).toBe(false);
      expect(responsive.pings).toBe(2);
      broadcaster.stop();
    });

    it('closes every client with a shutdown code when stopped', () => {
      const { broadcaster } = setup();
      const socket = new FakeSocket();
      broadcaster.connect(socket);

      broadcaster.stop();

      expect(socket.closed?.code).toBe(CloseCode.ServerShutdown);
      expect(broadcaster.clientCount).toBe(0);
    });
  });
});
