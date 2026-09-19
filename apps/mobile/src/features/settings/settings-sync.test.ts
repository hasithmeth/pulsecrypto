import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@pulsecrypto/contracts';
import { openSettingsSync } from './settings-sync';
import { useUserSettingsStore } from './user-settings-store';

const REMOTE: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  favourites: ['ETHUSDT'],
  binaryProtocol: true,
};

const respond = (status: number, body: unknown): Response =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
const onUnauthorized = jest.fn();
const session = (userId: string) => ({ userId, token: `token-${userId}`, onUnauthorized });
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
const puts = (): UserSettings[] =>
  fetchMock.mock.calls
    .filter(([, init]) => init.method === 'PUT')
    .map(([, init]) => JSON.parse(init.body as string) as UserSettings);

beforeEach(async () => {
  jest.useFakeTimers();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset().mockResolvedValue(respond(200, REMOTE));
  useUserSettingsStore.setState({ ...DEFAULT_USER_SETTINGS, localRevision: 0 });
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('settings sync', () => {
  it('loads the server copy for the signed-in user and caches it on the device', async () => {
    const sync = openSettingsSync(session('alice'));
    await settle();

    expect(useUserSettingsStore.getState().favourites).toEqual(['ETHUSDT']);
    expect(fetchMock.mock.calls[0]?.[1].headers).toMatchObject({
      authorization: 'Bearer token-alice',
    });
    expect(JSON.parse((await AsyncStorage.getItem('pulsecrypto.settings.alice')) ?? '{}')).toEqual(
      REMOTE,
    );
    sync.close();
  });

  it('falls back to the cached copy when the gateway is unreachable', async () => {
    await AsyncStorage.setItem(
      'pulsecrypto.settings.alice',
      JSON.stringify({ ...REMOTE, selectedPair: 'SOLUSDT' }),
    );
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const sync = openSettingsSync(session('alice'));
    await settle();

    expect(useUserSettingsStore.getState().selectedPair).toBe('SOLUSDT');
    expect(onUnauthorized).not.toHaveBeenCalled();
    sync.close();
  });

  it('debounces edits into one write of the latest state', async () => {
    const sync = openSettingsSync(session('alice'));
    await settle();

    useUserSettingsStore.getState().toggleFavourite('BTCUSDT');
    useUserSettingsStore.getState().selectPair('SOLUSDT');
    expect(puts()).toHaveLength(0);

    jest.advanceTimersByTime(600);
    await settle();

    expect(puts()).toEqual([
      { ...REMOTE, favourites: ['ETHUSDT', 'BTCUSDT'], selectedPair: 'SOLUSDT' },
    ]);
    sync.close();
  });

  it('retries a failed write when asked to flush', async () => {
    const sync = openSettingsSync(session('alice'));
    await settle();
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    useUserSettingsStore.getState().setAdaptivePolling(true);
    jest.advanceTimersByTime(600);
    await settle();
    sync.flush();
    await settle();

    expect(fetchMock.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(2);
    sync.close();
  });

  it('keeps an edit made while the server copy was still loading', async () => {
    let release: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const sync = openSettingsSync(session('alice'));
    await settle();

    useUserSettingsStore.getState().selectPair('XRPUSDT');
    release(respond(200, REMOTE));
    await settle();

    expect(useUserSettingsStore.getState().selectedPair).toBe('XRPUSDT');
    sync.close();
  });

  it('signs the user out when the gateway rejects the token', async () => {
    fetchMock.mockResolvedValue(
      respond(401, { error: { code: 'unauthorized', message: 'Sign in to continue' } }),
    );

    const sync = openSettingsSync(session('alice'));
    await settle();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    sync.close();
  });

  it('isolates users: closing resets the store and leaves each cache untouched', async () => {
    const alice = openSettingsSync(session('alice'));
    await settle();
    alice.close();
    expect(useUserSettingsStore.getState().favourites).toEqual([]);

    fetchMock.mockResolvedValue(respond(200, DEFAULT_USER_SETTINGS));
    const bob = openSettingsSync(session('bob'));
    await settle();
    useUserSettingsStore.getState().toggleFavourite('DOGEUSDT');
    await settle();
    bob.close();

    const cached = async (user: string): Promise<UserSettings> =>
      JSON.parse(
        (await AsyncStorage.getItem(`pulsecrypto.settings.${user}`)) ?? '{}',
      ) as UserSettings;
    expect((await cached('alice')).favourites).toEqual(['ETHUSDT']);
    expect((await cached('bob')).favourites).toEqual(['DOGEUSDT']);
  });
});
