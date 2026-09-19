import { resolveGatewayOrigin, toEndpoints } from './gateway';

describe('resolveGatewayOrigin', () => {
  it('prefers an explicit URL and trims trailing slashes', () => {
    expect(
      resolveGatewayOrigin({ url: 'https://gateway.test/' }, '192.168.1.5:8081', 'android'),
    ).toBe('https://gateway.test');
  });

  it('otherwise targets the machine serving the bundle, where the gateway also runs', () => {
    expect(resolveGatewayOrigin({}, '192.168.1.5:8081', 'android')).toBe('http://192.168.1.5:4000');
    expect(resolveGatewayOrigin({ port: '4100' }, '192.168.1.5:8081', 'ios')).toBe(
      'http://192.168.1.5:4100',
    );
  });

  it('falls back to the host loopback alias of each platform', () => {
    expect(resolveGatewayOrigin({}, undefined, 'android')).toBe('http://10.0.2.2:4000');
    expect(resolveGatewayOrigin({}, undefined, 'ios')).toBe('http://localhost:4000');
  });
});

describe('toEndpoints', () => {
  it('derives REST and WebSocket URLs, keeping TLS when present', () => {
    expect(toEndpoints('http://10.0.2.2:4000')).toEqual({
      origin: 'http://10.0.2.2:4000',
      pairsMetaUrl: 'http://10.0.2.2:4000/pairs/meta',
      streamUrl: 'ws://10.0.2.2:4000/ws',
    });
    expect(toEndpoints('https://gateway.test').streamUrl).toBe('wss://gateway.test/ws');
  });
});
