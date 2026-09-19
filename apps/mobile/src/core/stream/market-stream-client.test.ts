import { encode } from '@msgpack/msgpack';
import type { ClientMessage, HelloMessage, MarketMessage } from '@pulsecrypto/contracts';
import {
  MarketStreamClient,
  type ConnectionSnapshot,
  type WebSocketLike,
} from './market-stream-client';

class FakeSocket implements WebSocketLike {
  readyState = 1;
  binaryType = 'blob';
  onopen: WebSocketLike['onopen'] = null;
  onmessage: WebSocketLike['onmessage'] = null;
  onerror: WebSocketLike['onerror'] = null;
  onclose: WebSocketLike['onclose'] = null;
  readonly sent: ClientMessage[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** Completes the transport handshake, after which the client must authenticate. */
  open(): void {
    this.onopen?.({} as Event);
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  receiveBinary(message: object): void {
    const bytes = encode(message);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Opens and completes the application handshake in one step. */
  welcome(overrides: Partial<HelloMessage> = {}): void {
    this.open();
    this.receive(hello(overrides));
  }

  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

const hello = (overrides: Partial<HelloMessage> = {}): HelloMessage => ({
  type: 'hello',
  protocolVersion: 2,
  serverTime: 0,
  intervalMs: 100,
  encoding: 'json',
  limits: { minIntervalMs: 10, maxIntervalMs: 1_000 },
  pairs: ['BTCUSDT'],
  upstream: 'live',
  ...overrides,
});

function setup({ token = 'session-token' }: { token?: string | null } = {}) {
  const sockets: FakeSocket[] = [];
  const onUnauthorized = jest.fn();
  const snapshots: ConnectionSnapshot[] = [];
  const market: MarketMessage[] = [];
  const delays = [500, 1_000, 2_000];
  let attempt = 0;

  const client = new MarketStreamClient({
    url: 'ws://gateway.test/ws',
    onMarket: (message) => market.push(message),
    onConnection: (snapshot) => snapshots.push(snapshot),
    getToken: () => token,
    onUnauthorized,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoff: {
      get attempt() {
        return attempt;
      },
      next: () => delays[Math.min(attempt++, delays.length - 1)] ?? 0,
      reset: () => {
        attempt = 0;
      },
    },
    now: () => Date.now(),
  });

  const latest = (): ConnectionSnapshot => {
    const snapshot = snapshots.at(-1);
    if (!snapshot) throw new Error('no snapshot yet');
    return snapshot;
  };
  const socketAt = (index: number): FakeSocket => {
    const socket = sockets[index];
    if (!socket) throw new Error(`socket ${index} was never created`);
    return socket;
  };

  return { client, sockets, socketAt, latest, market, onUnauthorized };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MarketStreamClient', () => {
  it('is only open once the gateway has said hello', () => {
    const { client, socketAt, latest } = setup();

    client.start();
    expect(latest().phase).toBe('connecting');

    socketAt(0).welcome({ intervalMs: 250 });
    expect(latest()).toMatchObject({ phase: 'open', upstream: 'live', intervalMs: 250 });
    client.stop();
  });

  it('authenticates as soon as the socket opens, before anything else', () => {
    const { client, socketAt } = setup();
    client.subscribeBook('BTCUSDT');
    client.start();

    socketAt(0).open();

    expect(socketAt(0).binaryType).toBe('arraybuffer');
    expect(socketAt(0).sent).toEqual([{ type: 'auth', token: 'session-token' }]);
    client.stop();
  });

  it('reports a missing or rejected token instead of retrying with it forever', () => {
    const missing = setup({ token: null });
    missing.client.start();
    missing.socketAt(0).open();
    expect(missing.onUnauthorized).toHaveBeenCalledTimes(1);
    missing.client.stop();

    const rejected = setup();
    rejected.client.start();
    rejected.socketAt(0).open();
    rejected.socketAt(0).drop(4003);
    jest.advanceTimersByTime(60_000);

    expect(rejected.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(rejected.sockets).toHaveLength(1);
    rejected.client.stop();
  });

  it('decodes binary frames as MessagePack and text frames as JSON', () => {
    const { client, socketAt, market } = setup();
    client.start();
    socketAt(0).welcome();
    const frame = { type: 'market', ts: 7, tickers: [], books: [] };

    socketAt(0).receiveBinary(frame);
    socketAt(0).receive(frame);

    expect(market).toEqual([frame, frame]);
    expect(client.counters.malformed).toBe(0);
    client.stop();
  });

  it('pauses on request, reports it, and resumes with a fresh connection', () => {
    const { client, sockets, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    client.setPaused(true);
    expect(socketAt(0).closed).toBe(true);
    expect(latest()).toMatchObject({ phase: 'idle', paused: true });
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    client.setPaused(false);
    expect(sockets).toHaveLength(2);
    expect(latest().paused).toBe(false);
    client.stop();
  });

  it('forwards market frames and tracks status, interval and latency updates', () => {
    const { client, socketAt, latest, market } = setup();
    client.start();
    const socket = socketAt(0);
    socket.welcome();

    socket.receive({ type: 'market', ts: 1, tickers: [], books: [] });
    socket.receive({ type: 'status', upstream: 'down' });
    socket.receive({ type: 'configured', intervalMs: 500 });
    jest.advanceTimersByTime(40);
    socket.receive({ type: 'pong', id: 1, serverTime: 0 });

    expect(market).toHaveLength(1);
    expect(latest()).toMatchObject({ upstream: 'down', intervalMs: 500, latencyMs: 40 });
    client.stop();
  });

  it('ignores malformed frames without dropping the connection', () => {
    const { client, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    socketAt(0).onmessage?.({ data: '{not json' } as MessageEvent);
    socketAt(0).receive({ type: 'mystery' });

    expect(client.counters.malformed).toBe(2);
    expect(latest().phase).toBe('open');
    client.stop();
  });

  it('reconnects with increasing backoff and resets it after a successful hello', () => {
    const { client, sockets, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    socketAt(0).drop();
    expect(latest()).toMatchObject({ phase: 'reconnecting', attempt: 1, upstream: null });
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    socketAt(1).drop();
    expect(latest().attempt).toBe(2);
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    socketAt(2).welcome();
    expect(latest()).toMatchObject({ phase: 'open', attempt: 0 });
    client.stop();
  });

  it('replays subscriptions, interval and encoding after every reconnect', () => {
    const { client, socketAt } = setup();
    client.subscribeBook('BTCUSDT');
    client.requestInterval(250);
    client.requestEncoding('msgpack');
    client.start();

    socketAt(0).welcome();
    expect(socketAt(0).sent).toEqual(
      expect.arrayContaining([
        { type: 'auth', token: 'session-token' },
        { type: 'subscribe', channel: 'book', pair: 'BTCUSDT' },
        { type: 'configure', intervalMs: 250, encoding: 'msgpack' },
      ]),
    );

    socketAt(0).drop();
    jest.advanceTimersByTime(500);
    socketAt(1).welcome();
    expect(socketAt(1).sent).toEqual(
      expect.arrayContaining([
        { type: 'auth', token: 'session-token' },
        { type: 'subscribe', channel: 'book', pair: 'BTCUSDT' },
        { type: 'configure', intervalMs: 250, encoding: 'msgpack' },
      ]),
    );
    client.stop();
  });

  it('reference counts book subscriptions shared between screens', () => {
    const { client, socketAt } = setup();
    client.start();
    socketAt(0).welcome();
    const ofType = (type: ClientMessage['type']): ClientMessage[] =>
      socketAt(0).sent.filter((message) => message.type === type);

    const releaseFirst = client.subscribeBook('BTCUSDT');
    const releaseSecond = client.subscribeBook('BTCUSDT');
    expect(ofType('subscribe')).toHaveLength(1);

    releaseFirst();
    releaseFirst();
    expect(ofType('unsubscribe')).toHaveLength(0);

    releaseSecond();
    expect(ofType('unsubscribe')).toEqual([
      { type: 'unsubscribe', channel: 'book', pair: 'BTCUSDT' },
    ]);
    client.stop();
  });

  it('treats a silent socket as dead and reconnects', () => {
    const { client, sockets, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    jest.advanceTimersByTime(12_000);

    expect(socketAt(0).closed).toBe(true);
    expect(latest().phase).toBe('reconnecting');
    jest.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('gives up on a handshake that never completes', () => {
    const { client, socketAt, latest } = setup();
    client.start();

    jest.advanceTimersByTime(10_000);

    expect(socketAt(0).closed).toBe(true);
    expect(latest().phase).toBe('reconnecting');
    client.stop();
  });

  it('waits while the device is offline and reconnects the moment it returns', () => {
    const { client, sockets, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    client.setOnline(false);
    expect(latest().phase).toBe('offline');
    expect(socketAt(0).closed).toBe(true);
    jest.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);

    client.setOnline(true);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('releases the socket in the background and restores it in the foreground', () => {
    const { client, sockets, socketAt, latest } = setup();
    client.start();
    socketAt(0).welcome();

    client.setForeground(false);
    expect(socketAt(0).closed).toBe(true);
    expect(latest().phase).toBe('idle');

    client.setForeground(true);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('leaves no timers running once stopped', () => {
    const { client, socketAt } = setup();
    client.start();
    socketAt(0).welcome();
    socketAt(0).drop();

    client.stop();

    expect(jest.getTimerCount()).toBe(0);
  });
});
