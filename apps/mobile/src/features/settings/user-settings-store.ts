import { DEFAULT_USER_SETTINGS, type PairSymbol, type UserSettings } from '@pulsecrypto/contracts';
import { create } from 'zustand';

interface UserSettingsStore extends UserSettings {
  /** Bumped by user actions only, so the sync layer can tell local edits from applied server state. */
  readonly localRevision: number;
  readonly toggleFavourite: (symbol: PairSymbol) => void;
  readonly selectPair: (symbol: PairSymbol) => void;
  readonly setStreamInterval: (intervalMs: number) => void;
  readonly setBinaryProtocol: (enabled: boolean) => void;
  readonly setAdaptivePolling: (enabled: boolean) => void;
  readonly replace: (settings: UserSettings) => void;
}

/**
 * Everything a user can personalise. It holds one user's values at a time and is
 * deliberately not self-persisting: loading, caching and syncing are keyed by
 * user id and owned by the settings sync layer.
 */
export const useUserSettingsStore = create<UserSettingsStore>((set) => {
  const edit = (patch: (state: UserSettingsStore) => Partial<UserSettings>): void => {
    set((state) => ({ ...patch(state), localRevision: state.localRevision + 1 }));
  };

  return {
    ...DEFAULT_USER_SETTINGS,
    localRevision: 0,
    toggleFavourite: (symbol) => {
      edit(({ favourites }) => ({
        favourites: favourites.includes(symbol)
          ? favourites.filter((favourite) => favourite !== symbol)
          : [...favourites, symbol],
      }));
    },
    selectPair: (selectedPair) => {
      edit(() => ({ selectedPair }));
    },
    setStreamInterval: (streamIntervalMs) => {
      edit(() => ({ streamIntervalMs }));
    },
    setBinaryProtocol: (binaryProtocol) => {
      edit(() => ({ binaryProtocol }));
    },
    setAdaptivePolling: (adaptivePolling) => {
      edit(() => ({ adaptivePolling }));
    },
    replace: (settings) => {
      set(settings);
    },
  };
});

export const selectSettings = ({
  favourites,
  selectedPair,
  streamIntervalMs,
  binaryProtocol,
  adaptivePolling,
}: UserSettings): UserSettings => ({
  favourites,
  selectedPair,
  streamIntervalMs,
  binaryProtocol,
  adaptivePolling,
});

export const useIsFavourite = (symbol: PairSymbol): boolean =>
  useUserSettingsStore((state) => state.favourites.includes(symbol));
