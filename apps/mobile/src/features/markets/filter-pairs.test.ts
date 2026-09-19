import type { PairMeta } from '@pulsecrypto/contracts';
import { filterPairs } from './filter-pairs';

const pair = (base: string, displayName: string): PairMeta => ({
  symbol: `${base}USDT`,
  base,
  quote: 'USDT',
  displayName,
  status: 'TRADING',
  priceDecimals: 2,
  quantityDecimals: 4,
  high24h: null,
  low24h: null,
  volume24h: null,
});

const PAIRS = [
  pair('BTC', 'Bitcoin'),
  pair('ETH', 'Ethereum'),
  pair('SOL', 'Solana'),
  pair('DOGE', 'Dogecoin'),
];
const symbols = (pairs: PairMeta[]): string[] => pairs.map((entry) => entry.base);

describe('filterPairs', () => {
  it('returns everything in gateway order when nothing is filtered', () => {
    expect(symbols(filterPairs(PAIRS, '', 'all', {}))).toEqual(['BTC', 'ETH', 'SOL', 'DOGE']);
  });

  it.each([
    ['btc', ['BTC']],
    ['BTC / USDT', ['BTC']],
    ['  eth ', ['ETH']],
    ['coin', ['BTC', 'DOGE']],
    ['usdt', ['BTC', 'ETH', 'SOL', 'DOGE']],
    ['zzz', []],
  ])('matches "%s" against symbols and names', (query, expected) => {
    expect(symbols(filterPairs(PAIRS, query, 'all', {}))).toEqual(expected);
  });

  it('pins favourites to the top without reordering the rest', () => {
    expect(symbols(filterPairs(PAIRS, '', 'all', { SOLUSDT: true, DOGEUSDT: true }))).toEqual([
      'SOL',
      'DOGE',
      'BTC',
      'ETH',
    ]);
  });

  it('combines the favourites filter with search', () => {
    const favourites = { BTCUSDT: true, ETHUSDT: true } as const;
    expect(symbols(filterPairs(PAIRS, '', 'favourites', favourites))).toEqual(['BTC', 'ETH']);
    expect(symbols(filterPairs(PAIRS, 'eth', 'favourites', favourites))).toEqual(['ETH']);
  });
});
