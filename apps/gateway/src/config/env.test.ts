import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env';

describe('loadConfig', () => {
  it('defaults to the required pairs and a 100 ms interval', () => {
    const config = loadConfig({});

    expect(config.broadcast.defaultIntervalMs).toBe(100);
    expect(config.pairs).toEqual(
      expect.arrayContaining(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'XRPUSDT']),
    );
  });

  it('normalises the pair list', () => {
    expect(loadConfig({ PAIRS: ' btcusdt, ethusdt ,' }).pairs).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it.each([
    ['a non-numeric port', { PORT: 'abc' }],
    ['an interval outside the client range', { BROADCAST_INTERVAL_MS: '5000' }],
    ['a non-websocket upstream url', { BINANCE_WS_URL: 'https://example.test' }],
    ['a watermark above the hard limit', { CLIENT_HIGH_WATERMARK_BYTES: '9999999' }],
  ])('rejects %s', (_, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });

  it('refuses to start in production without an auth secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(
      loadConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(32) }).auth
        .usesDevelopmentSecret,
    ).toBe(false);
  });
});
