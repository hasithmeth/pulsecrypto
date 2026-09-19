import { DEFAULT_USER_SETTINGS } from '@pulsecrypto/contracts';
import { selectSettings, useUserSettingsStore } from './user-settings-store';

beforeEach(() => {
  useUserSettingsStore.setState({ ...DEFAULT_USER_SETTINGS, localRevision: 0 });
});

describe('user settings store', () => {
  it('toggles favourites on and off, keeping insertion order', () => {
    const { toggleFavourite } = useUserSettingsStore.getState();

    toggleFavourite('ETHUSDT');
    toggleFavourite('BTCUSDT');
    toggleFavourite('ETHUSDT');

    expect(useUserSettingsStore.getState().favourites).toEqual(['BTCUSDT']);
  });

  it('counts user edits but not applied server state', () => {
    const store = useUserSettingsStore.getState();

    store.selectPair('SOLUSDT');
    store.setBinaryProtocol(false);
    expect(useUserSettingsStore.getState().localRevision).toBe(2);

    store.replace({ ...DEFAULT_USER_SETTINGS, adaptivePolling: true });
    expect(useUserSettingsStore.getState()).toMatchObject({
      adaptivePolling: true,
      localRevision: 2,
    });
  });

  it('exposes exactly the contract shape for syncing', () => {
    useUserSettingsStore.getState().setStreamInterval(250);

    expect(selectSettings(useUserSettingsStore.getState())).toEqual({
      ...DEFAULT_USER_SETTINGS,
      streamIntervalMs: 250,
    });
  });
});
