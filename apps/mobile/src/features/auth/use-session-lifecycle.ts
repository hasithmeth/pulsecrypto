import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useConnectionStore } from '@/core/stream/connection-store';
import { marketStream } from '@/core/stream/market-stream';
import { useAdaptivePolling } from '@/core/stream/use-adaptive-polling';
import { useStreamLifecycle } from '@/core/stream/use-stream-lifecycle';
import { openSettingsSync } from '@/features/settings/settings-sync';
import { useUserSettingsStore } from '@/features/settings/user-settings-store';
import { useAuthStore } from './auth-store';

/**
 * Everything that exists only for a signed-in user hangs off this hook: the
 * stream, their settings, and applying those settings to the stream. Signing
 * out tears all of it down, so the next user starts clean.
 */
export function useSessionLifecycle(): void {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);
  const restore = useAuthStore((state) => state.restore);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    void restore();
  }, [restore]);

  useStreamLifecycle(status === 'signedIn');
  useAdaptivePolling();

  useEffect(() => {
    if (!userId || !token) return;
    const sync = openSettingsSync({ userId, token, onUnauthorized: () => void signOut() });
    const unsubscribe = useConnectionStore.subscribe((state, previous) => {
      if (state.phase === 'open' && previous.phase !== 'open') sync.flush();
    });
    return () => {
      unsubscribe();
      sync.close();
      marketStream.setPaused(false);
      queryClient.clear();
    };
  }, [userId, token, signOut, queryClient]);

  const intervalMs = useUserSettingsStore((state) => state.streamIntervalMs);
  const binaryProtocol = useUserSettingsStore((state) => state.binaryProtocol);

  useEffect(() => {
    if (intervalMs !== null) marketStream.requestInterval(intervalMs);
  }, [intervalMs]);

  useEffect(() => {
    marketStream.requestEncoding(binaryProtocol ? 'msgpack' : 'json');
  }, [binaryProtocol]);
}
