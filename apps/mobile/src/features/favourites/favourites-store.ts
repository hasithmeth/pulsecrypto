import type { PairSymbol } from '@pulsecrypto/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appStorage } from '@/core/storage/app-storage';

interface FavouritesStore {
  readonly symbols: Readonly<Record<PairSymbol, true>>;
  readonly toggle: (symbol: PairSymbol) => void;
}

export const useFavouritesStore = create<FavouritesStore>()(
  persist(
    (set) => ({
      symbols: {},
      toggle: (symbol) => {
        set(({ symbols }) => {
          if (!symbols[symbol]) return { symbols: { ...symbols, [symbol]: true } };
          const { [symbol]: _removed, ...rest } = symbols;
          return { symbols: rest };
        });
      },
    }),
    {
      name: 'pulsecrypto.favourites',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      partialize: ({ symbols }) => ({ symbols }),
    },
  ),
);

export const useIsFavourite = (symbol: PairSymbol): boolean =>
  useFavouritesStore((state) => state.symbols[symbol] === true);
