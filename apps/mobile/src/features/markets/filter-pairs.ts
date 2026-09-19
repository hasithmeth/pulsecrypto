import type { PairMeta, PairSymbol } from '@pulsecrypto/contracts';

export type MarketFilter = 'all' | 'favourites';

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const matches = (pair: PairMeta, needle: string): boolean =>
  normalise(pair.symbol).includes(needle) || normalise(pair.displayName).includes(needle);

/** Favourites float to the top; within each group the gateway's order is preserved. */
export function filterPairs(
  pairs: readonly PairMeta[],
  query: string,
  filter: MarketFilter,
  favourites: readonly PairSymbol[],
): PairMeta[] {
  const needle = normalise(query);
  const starred = new Set(favourites);
  const visible = pairs.filter(
    (pair) =>
      (filter === 'all' || starred.has(pair.symbol)) && (needle === '' || matches(pair, needle)),
  );
  return [
    ...visible.filter((pair) => starred.has(pair.symbol)),
    ...visible.filter((pair) => !starred.has(pair.symbol)),
  ];
}
