import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFavouritesStore } from './favourites-store';

const STORAGE_KEY = 'pulsecrypto.favourites';

const flushPersistence = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  useFavouritesStore.setState({ symbols: {} });
  await AsyncStorage.clear();
});

describe('favourites store', () => {
  it('toggles a pair on and off', () => {
    const { toggle } = useFavouritesStore.getState();

    toggle('BTCUSDT');
    expect(useFavouritesStore.getState().symbols).toEqual({ BTCUSDT: true });

    toggle('BTCUSDT');
    expect(useFavouritesStore.getState().symbols).toEqual({});
  });

  it('writes every change to device storage', async () => {
    useFavouritesStore.getState().toggle('ETHUSDT');
    await flushPersistence();

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}') as {
      state: unknown;
      version: number;
    };
    expect(stored).toEqual({ state: { symbols: { ETHUSDT: true } }, version: 1 });
  });

  it('restores favourites saved by a previous session', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { symbols: { SOLUSDT: true, XRPUSDT: true } }, version: 1 }),
    );

    await useFavouritesStore.persist.rehydrate();

    expect(useFavouritesStore.getState().symbols).toEqual({ SOLUSDT: true, XRPUSDT: true });
  });
});
