import type { PairSymbol } from '@pulsecrypto/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/core/storage/app-storage';

interface PreferencesStore {
  readonly selectedPair: PairSymbol;
  readonly streamIntervalMs: number | null;
  readonly selectPair: (symbol: PairSymbol) => void;
  readonly setStreamInterval: (intervalMs: number) => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      selectedPair: 'BTCUSDT',
      streamIntervalMs: null,
      selectPair: (selectedPair) => {
        set({ selectedPair });
      },
      setStreamInterval: (streamIntervalMs) => {
        set({ streamIntervalMs });
      },
    }),
    {
      name: 'pulsecrypto.preferences',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ selectedPair, streamIntervalMs }) => ({ selectedPair, streamIntervalMs }),
    },
  ),
);
