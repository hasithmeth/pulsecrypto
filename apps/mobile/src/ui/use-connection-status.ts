import { useConnectionStore } from '@/core/stream/connection-store';
import type { ColorToken } from './theme';

export interface ConnectionStatus {
  readonly label: string;
  readonly tone: ColorToken;
  readonly isLive: boolean;
}

const STATUS = {
  live: { label: 'CONNECTED', tone: 'positive', isLive: true },
  feedDown: { label: 'FEED DOWN', tone: 'accent', isLive: false },
  connecting: { label: 'CONNECTING', tone: 'accent', isLive: false },
  reconnecting: { label: 'RECONNECTING', tone: 'accent', isLive: false },
  offline: { label: 'OFFLINE', tone: 'negative', isLive: false },
  idle: { label: 'PAUSED', tone: 'textMuted', isLive: false },
} as const satisfies Record<string, ConnectionStatus>;

export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore(({ phase, upstream }) => {
    if (phase === 'open') return upstream === 'live' ? STATUS.live : STATUS.feedDown;
    return STATUS[phase];
  });
}
