import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { marketStream } from './market-stream';

/**
 * Ties the connection to the app's real-world conditions. The socket is
 * released in the background, where the OS would silently kill it anyway, and
 * a regained network triggers an immediate retry instead of waiting out backoff.
 */
export function useStreamLifecycle(): void {
  useEffect(() => {
    marketStream.start();

    const appState = AppState.addEventListener('change', (status) => {
      marketStream.setForeground(status !== 'background');
    });
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      marketStream.setOnline(state.isConnected !== false);
    });

    return () => {
      appState.remove();
      unsubscribeNetInfo();
      marketStream.stop();
    };
  }, []);
}
