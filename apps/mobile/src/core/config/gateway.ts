import { PAIRS_META_PATH, STREAM_PATH } from '@pulsecrypto/contracts';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface GatewayEndpoints {
  readonly origin: string;
  readonly pairsMetaUrl: string;
  readonly streamUrl: string;
}

const DEFAULT_PORT = '4000';

/**
 * Resolution order: explicit URL, then the machine serving the JS bundle (which
 * is also where the gateway runs during development), then the platform's
 * loopback alias for the host.
 */
export function resolveGatewayOrigin(
  env: { url?: string; port?: string },
  devServerHost: string | undefined,
  platform: string,
): string {
  if (env.url) return env.url.replace(/\/+$/, '');
  const port = env.port ?? DEFAULT_PORT;
  const host = devServerHost?.split(':')[0] ?? (platform === 'android' ? '10.0.2.2' : 'localhost');
  return `http://${host}:${port}`;
}

export function toEndpoints(origin: string): GatewayEndpoints {
  return {
    origin,
    pairsMetaUrl: `${origin}${PAIRS_META_PATH}`,
    streamUrl: `${origin.replace(/^http/, 'ws')}${STREAM_PATH}`,
  };
}

export const gateway: GatewayEndpoints = toEndpoints(
  resolveGatewayOrigin(
    { url: process.env.EXPO_PUBLIC_GATEWAY_URL, port: process.env.EXPO_PUBLIC_GATEWAY_PORT },
    Constants.expoConfig?.hostUri,
    Platform.OS,
  ),
);
