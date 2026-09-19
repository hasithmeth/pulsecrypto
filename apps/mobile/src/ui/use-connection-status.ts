import { useConnectionStore } from '@/core/stream/connection-store';
import type { ColorToken } from './theme';

export interface ConnectionStatus {
  readonly label: string;
  /** Short form for the header pill, which the design sizes for a four-letter word. */
  readonly pillLabel: string;
  readonly tone: ColorToken;
  readonly isLive: boolean;
}

const STATUS = {
  live: { label: 'CONNECTED', pillLabel: 'LIVE', tone: 'positive', isLive: true },
  feedDown: { label: 'FEED DOWN', pillLabel: 'FEED DOWN', tone: 'accent', isLive: false },
  connecting: { label: 'CONNECTING', pillLabel: 'CONNECTING', tone: 'accent', isLive: false },
  reconnecting: { label: 'RECONNECTING', pillLabel: 'RETRYING', tone: 'accent', isLive: false },
  offline: { label: 'OFFLINE', pillLabel: 'OFFLINE', tone: 'negative', isLive: false },
  idle: { label: 'PAUSED', pillLabel: 'PAUSED', tone: 'textMuted', isLive: false },
} as const satisfies Record<string, ConnectionStatus>;

export function useConnectionStatus(): ConnectionStatus {
  return useConnectionStore(({ phase, upstream }) => {
    if (phase === 'open') return upstream === 'live' ? STATUS.live : STATUS.feedDown;
    return STATUS[phase];
  });
}
