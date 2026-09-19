import type { AddressInfo } from 'node:net';
import {
  PairsMetaResponseSchema,
  ServerMessageSchema,
  type MarketMessage,
  type ServerMessage,
} from '@pulsecrypto/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import { rawDataToString } from './lib/raw-data';

const config = loadConfig({
  NODE_ENV: 'test',
  PORT: '0',
  HOST: '127.0.0.1',
  PAIRS: 'BTCUSDT,ETHUSDT',
  MARKET_SOURCE: 'simulated',
  SIMULATED_UPDATES_PER_SECOND: '2000',
  BROADCAST_INTERVAL_MS: '50',
});

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function collect(
  url: string,
  until: (messages: ServerMessage[]) => boolean,
): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages: ServerMessage[] = [];
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`timed out after ${messages.length} messages`));
    }, 4_000);

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'book', pair: 'ETHUSDT' }));
    });
    socket.on('message', (data: WebSocket.RawData) => {
      messages.push(ServerMessageSchema.parse(JSON.parse(rawDataToString(data))));
      if (until(messages)) {
        clearTimeout(timeout);
        socket.close();
        resolve(messages);
      }
    });
    socket.on('error', reject);
  });
}

describe('gateway', () => {
  it('serves metadata for every configured pair', async () => {
    app = await buildApp(config);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/pairs/meta' });

    expect(response.statusCode).toBe(200);
    const body = PairsMetaResponseSchema.parse(response.json());
    expect(body.pairs.map((pair) => pair.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(body.pairs[0]).toMatchObject({
      displayName: 'Bitcoin',
      status: 'TRADING',
      priceDecimals: 2,
    });
    expect(body.pairs[0]?.high24h).toEqual(expect.any(Number));
  });

  it('reports health with upstream state and throughput counters', async () => {
    app = await buildApp(config);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.json()).toMatchObject({
      status: 'ok',
      upstream: 'live',
      clients: 0,
      metrics: { evictions: 0 },
    });
  });

  it('streams schema-valid frames at the configured cadence under a 2000 msg/s feed', async () => {
    app = await buildApp(config);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;

    const isMarket = (message: ServerMessage): message is MarketMessage =>
      message.type === 'market';
    const messages = await collect(
      `ws://127.0.0.1:${port}/ws`,
      (received) => received.filter(isMarket).length >= 10,
    );

    expect(messages[0]).toMatchObject({
      type: 'hello',
      intervalMs: 50,
      pairs: ['BTCUSDT', 'ETHUSDT'],
    });

    const frames = messages.filter(isMarket);
    const gaps = frames.slice(1).map((frame, index) => frame.ts - (frames[index]?.ts ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(40);

    const books = frames.flatMap((frame) => frame.books);
    expect(books.length).toBeGreaterThan(0);
    expect(new Set(books.map((book) => book.pair))).toEqual(new Set(['ETHUSDT']));
    expect(books[0]?.bids).toHaveLength(20);
  });
});
