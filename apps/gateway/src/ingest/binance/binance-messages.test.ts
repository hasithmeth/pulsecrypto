import { describe, expect, it } from 'vitest';
import { combinedStreamUrl, parseBinanceMessage } from './binance-messages';

const envelope = (stream: string, data: unknown): string => JSON.stringify({ stream, data });

describe('combinedStreamUrl', () => {
  it('subscribes to depth, trades and the 24h ticker for every pair', () => {
    expect(combinedStreamUrl('wss://example.test', ['BTCUSDT', 'ETHUSDT'])).toBe(
      'wss://example.test/stream?streams=btcusdt@depth20@100ms/btcusdt@aggTrade/btcusdt@ticker/ethusdt@depth20@100ms/ethusdt@aggTrade/ethusdt@ticker',
    );
  });
});

describe('parseBinanceMessage', () => {
  it('maps a partial depth payload, taking the pair from the stream name', () => {
    const raw = envelope('btcusdt@depth20@100ms', {
      lastUpdateId: 42,
      bids: [
        ['64239.50', '0.45220'],
        ['64238.00', '0.00000'],
      ],
      asks: [['64241.50', '0.11200']],
    });

    expect(parseBinanceMessage(raw, 1_234)).toEqual({
      kind: 'book',
      pair: 'BTCUSDT',
      snapshot: {
        lastUpdateId: 42,
        receivedAt: 1_234,
        bids: [[64239.5, 0.4522]],
        asks: [[64241.5, 0.112]],
      },
    });
  });

  it('maps an aggregate trade to a price update', () => {
    const raw = envelope('ethusdt@aggTrade', {
      e: 'aggTrade',
      E: 5_000,
      s: 'ETHUSDT',
      p: '3100.25',
    });
    expect(parseBinanceMessage(raw, 0)).toEqual({
      kind: 'trade',
      pair: 'ETHUSDT',
      price: 3100.25,
      ts: 5_000,
    });
  });

  it('maps a 24h ticker to day statistics', () => {
    const raw = envelope('solusdt@ticker', {
      e: '24hrTicker',
      E: 6_000,
      c: '145.10',
      P: '-1.220',
      h: '150.00',
      l: '140.00',
      v: '98765.4',
    });
    expect(parseBinanceMessage(raw, 0)).toEqual({
      kind: 'dayStats',
      pair: 'SOLUSDT',
      stats: {
        eventTime: 6_000,
        lastPrice: 145.1,
        changePct: -1.22,
        high: 150,
        low: 140,
        volume: 98765.4,
      },
    });
  });

  it.each([
    ['malformed JSON', '{'],
    ['a non-numeric price', envelope('btcusdt@aggTrade', { e: 'aggTrade', E: 1, p: 'n/a' })],
    ['an unknown stream', envelope('btcusdt@kline_1m', {})],
    ['a subscription acknowledgement', JSON.stringify({ result: null, id: 1 })],
  ])('throws on %s', (_, raw) => {
    expect(() => parseBinanceMessage(raw, 0)).toThrow();
  });
});
