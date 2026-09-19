import { create } from 'zustand';
import { INITIAL_CONNECTION, type ConnectionSnapshot } from './market-stream-client';

export const useConnectionStore = create<ConnectionSnapshot>(() => INITIAL_CONNECTION);

export const useConnectionPhase = (): ConnectionSnapshot['phase'] =>
  useConnectionStore((state) => state.phase);

/** True only when both hops are healthy: app to gateway, and gateway to the exchange. */
export const useIsStreamLive = (): boolean =>
  useConnectionStore((state) => state.phase === 'open' && state.upstream === 'live');
