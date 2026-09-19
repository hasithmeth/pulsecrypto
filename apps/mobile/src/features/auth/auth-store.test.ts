import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from './auth-store';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) =>
      Promise.resolve(void values.set(key, value)),
    ),
    deleteItemAsync: jest.fn((key: string) => Promise.resolve(void values.delete(key))),
  };
});

const SESSION = {
  token: 'jwt-token',
  user: {
    id: 'user-1',
    publicId: '882941',
    email: 'trader@example.com',
    displayName: 'Pro Trader',
  },
};

const respond = (status: number, body: unknown): Response =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

beforeEach(async () => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  await SecureStore.deleteItemAsync('pulsecrypto.session');
  useAuthStore.setState({ status: 'restoring', user: null, token: null });
});

describe('auth store', () => {
  it('starts signed out when the device holds no session', async () => {
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', token: null });
  });

  it('signs in, keeps the session in secure storage, and restores it on the next launch', async () => {
    fetchMock.mockResolvedValue(respond(200, SESSION));

    await useAuthStore
      .getState()
      .signIn({ email: 'trader@example.com', password: 'correct horse' });

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user: SESSION.user });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/auth\/login$/);

    useAuthStore.setState({ status: 'restoring', user: null, token: null });
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', token: 'jwt-token' });
  });

  it('surfaces the gateway reason and stays signed out when credentials are wrong', async () => {
    fetchMock.mockResolvedValue(
      respond(401, {
        error: { code: 'invalid_credentials', message: 'Email or password is incorrect' },
      }),
    );

    await expect(
      useAuthStore.getState().signIn({ email: 'trader@example.com', password: 'nope' }),
    ).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: 'Email or password is incorrect',
    });
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('forgets the session on sign out', async () => {
    fetchMock.mockResolvedValue(respond(201, SESSION));
    await useAuthStore.getState().signUp({ ...SESSION.user, password: 'correct horse' });

    await useAuthStore.getState().signOut();
    await useAuthStore.getState().restore();

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null, token: null });
  });

  it('ignores a corrupted stored session instead of crashing at launch', async () => {
    await SecureStore.setItemAsync('pulsecrypto.session', '{not json');
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
