import type { PairSymbol, TradingStatus } from '@pulsecrypto/contracts';

export interface PairDefinition {
  readonly symbol: PairSymbol;
  readonly base: string;
  readonly quote: string;
  readonly displayName: string;
  readonly status: TradingStatus;
  readonly priceDecimals: number;
  readonly quantityDecimals: number;
  /** Approximate. Binance publishes no supply data, and the UI only needs an indicative market cap. */
  readonly circulatingSupply: number;
}

const define = (
  base: string,
  displayName: string,
  priceDecimals: number,
  quantityDecimals: number,
  circulatingSupply: number,
): PairDefinition => ({
  symbol: `${base}USDT`,
  base,
  quote: 'USDT',
  displayName,
  status: 'TRADING',
  priceDecimals,
  quantityDecimals,
  circulatingSupply,
});

const KNOWN_PAIRS: readonly PairDefinition[] = [
  define('BTC', 'Bitcoin', 2, 5, 19_900_000),
  define('ETH', 'Ethereum', 2, 4, 120_700_000),
  define('SOL', 'Solana', 2, 3, 540_000_000),
  define('DOGE', 'Dogecoin', 5, 0, 150_000_000_000),
  define('XRP', 'XRP', 4, 1, 59_000_000_000),
  define('BNB', 'BNB', 2, 3, 139_000_000),
  define('ADA', 'Cardano', 4, 1, 36_000_000_000),
  define('LINK', 'Chainlink', 2, 2, 678_000_000),
  define('AVAX', 'Avalanche', 2, 2, 422_000_000),
  define('LTC', 'Litecoin', 2, 3, 76_000_000),
];

const BY_SYMBOL = new Map(KNOWN_PAIRS.map((pair) => [pair.symbol, pair]));

export const knownSymbols = (): PairSymbol[] => KNOWN_PAIRS.map((pair) => pair.symbol);

export class PairRegistry {
  private readonly pairs: ReadonlyMap<PairSymbol, PairDefinition>;

  constructor(symbols: readonly PairSymbol[]) {
    const entries = symbols.map((symbol) => {
      const definition = BY_SYMBOL.get(symbol);
      if (!definition) {
        throw new Error(`Unsupported pair "${symbol}". Known pairs: ${knownSymbols().join(', ')}`);
      }
      return [symbol, definition] as const;
    });
    this.pairs = new Map(entries);
  }

  get symbols(): PairSymbol[] {
    return [...this.pairs.keys()];
  }

  get definitions(): PairDefinition[] {
    return [...this.pairs.values()];
  }

  has(symbol: PairSymbol): boolean {
    return this.pairs.has(symbol);
  }

  get(symbol: PairSymbol): PairDefinition | undefined {
    return this.pairs.get(symbol);
  }
}
