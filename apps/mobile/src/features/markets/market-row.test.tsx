import type { PairMeta, Ticker } from '@pulsecrypto/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useConnectionStore } from '@/core/stream/connection-store';
import { useMarketStore } from '@/core/stream/market-store';
import { INITIAL_CONNECTION } from '@/core/stream/market-stream-client';
import { useFavouritesStore } from '@/features/favourites/favourites-store';
import { MarketRow } from './market-row';

const BTC: PairMeta = {
  symbol: 'BTCUSDT',
  base: 'BTC',
  quote: 'USDT',
  displayName: 'Bitcoin',
  status: 'TRADING',
  priceDecimals: 2,
  quantityDecimals: 5,
  circulatingSupply: 19_900_000,
  high24h: null,
  low24h: null,
  volume24h: null,
};

const ticker = (overrides: Partial<Ticker> = {}): Ticker => ({
  pair: 'BTCUSDT',
  ts: 0,
  price: 64239.5,
  change24hPct: 1.82,
  high24h: 65000,
  low24h: 63000,
  volume24h: 1000,
  ...overrides,
});

const publish = (...tickers: Ticker[]): Promise<void> =>
  act(() => {
    useMarketStore.getState().applyBatch({ tickers, books: [] }, Date.now());
  });

beforeEach(() => {
  useMarketStore.setState({ tickers: {}, books: {}, lastFrameAt: null });
  useFavouritesStore.setState({ symbols: {} });
  useConnectionStore.setState({ ...INITIAL_CONNECTION, phase: 'open', upstream: 'live' });
});

describe('MarketRow', () => {
  it('shows placeholders until the first tick, then the live price and change', async () => {
    await render(<MarketRow pair={BTC} onPress={jest.fn()} />);
    expect(screen.getAllByText('--')).toHaveLength(2);
    expect(screen.getByLabelText('Not updating')).toBeTruthy();

    await publish(ticker());

    expect(screen.getByText('64,239.50')).toBeTruthy();
    expect(screen.getByText('▲ 1.82%')).toBeTruthy();
    expect(screen.getByLabelText('Live')).toBeTruthy();
  });

  it('follows its own pair and ignores ticks for other pairs', async () => {
    await render(<MarketRow pair={BTC} onPress={jest.fn()} />);

    await publish(
      ticker({ price: 100, change24hPct: -0.41 }),
      ticker({ pair: 'ETHUSDT', price: 999 }),
    );

    expect(screen.getByText('100.00')).toBeTruthy();
    expect(screen.getByText('▼ 0.41%')).toBeTruthy();
    expect(screen.queryByText('999.00')).toBeNull();
  });

  it('marks the row as not live when the stream drops, while keeping the last price', async () => {
    await render(<MarketRow pair={BTC} onPress={jest.fn()} />);
    await publish(ticker());

    await act(() => {
      useConnectionStore.setState({ phase: 'reconnecting', upstream: null });
    });

    expect(screen.getByText('64,239.50')).toBeTruthy();
    expect(screen.getByLabelText('Not updating')).toBeTruthy();
  });

  it('toggles the favourite without opening the pair', async () => {
    const onPress = jest.fn();
    await render(<MarketRow pair={BTC} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Add Bitcoin to favourites'));

    expect(useFavouritesStore.getState().symbols).toEqual({ BTCUSDT: true });
    expect(screen.getByLabelText('Remove Bitcoin from favourites')).toBeTruthy();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('opens the pair when the row is pressed', async () => {
    const onPress = jest.fn();
    await render(<MarketRow pair={BTC} onPress={onPress} />);

    await fireEvent.press(screen.getByText('Bitcoin'));

    expect(onPress).toHaveBeenCalledWith(BTC);
  });
});
