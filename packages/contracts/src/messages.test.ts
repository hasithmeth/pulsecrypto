import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, ServerMessageSchema } from './messages';

describe('ClientMessageSchema', () => {
  it('accepts a book subscription', () => {
    const message = { type: 'subscribe', channel: 'book', pair: 'BTCUSDT' };
    expect(ClientMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ['an unknown type', { type: 'order', pair: 'BTCUSDT' }],
    ['an unknown channel', { type: 'subscribe', channel: 'trades', pair: 'BTCUSDT' }],
    ['a malformed pair', { type: 'subscribe', channel: 'book', pair: 'btc/usdt' }],
    ['a non-positive interval', { type: 'configure', intervalMs: 0 }],
    ['an empty configure', { type: 'configure' }],
    ['an unknown encoding', { type: 'configure', encoding: 'protobuf' }],
    ['an empty auth token', { type: 'auth', token: '' }],
  ])('rejects %s', (_, message) => {
    expect(ClientMessageSchema.safeParse(message).success).toBe(false);
  });

  it('accepts configuring only the encoding', () => {
    expect(ClientMessageSchema.safeParse({ type: 'configure', encoding: 'msgpack' }).success).toBe(
      true,
    );
  });
});

describe('ServerMessageSchema', () => {
  it('round-trips a market frame through JSON', () => {
    const frame = {
      type: 'market',
      ts: 1720802025123,
      tickers: [
        {
          pair: 'BTCUSDT',
          ts: 1720802025100,
          price: 109235.42,
          change24hPct: 1.82,
          high24h: 110000,
          low24h: 107500,
          volume24h: 18234.5,
        },
      ],
      books: [
        {
          pair: 'BTCUSDT',
          ts: 1720802025120,
          lastUpdateId: 42,
          spread: 0.41,
          spreadPct: 0.0004,
          buyPressure: 63,
          sellPressure: 37,
          bids: [[109235.21, 0.5]],
          asks: [[109235.62, 0.25]],
        },
      ],
    };
    expect(ServerMessageSchema.parse(JSON.parse(JSON.stringify(frame)))).toEqual(frame);
  });
});
