import {
  ApiErrorResponseSchema,
  AuthResponseSchema,
  DEFAULT_USER_SETTINGS,
  UserSettingsSchema,
  type AuthResponse,
} from '@pulsecrypto/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config/env';
import { InMemoryUserRepository } from '../testing/in-memory-user-repository';

const config = loadConfig({
  NODE_ENV: 'test',
  PAIRS: 'BTCUSDT',
  MARKET_SOURCE: 'simulated',
  AUTH_RATE_LIMIT_MAX: '5',
});

const credentials = {
  email: 'trader@example.com',
  password: 'correct horse',
  displayName: 'Pro Trader',
};

let app: FastifyInstance;
let users: InMemoryUserRepository;

beforeEach(async () => {
  users = new InMemoryUserRepository();
  app = await buildApp(config, { userRepository: users });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as object });
const errorCode = (body: unknown): string => ApiErrorResponseSchema.parse(body).error.code;

async function signup(overrides: Partial<typeof credentials> = {}): Promise<AuthResponse> {
  const response = await post('/auth/signup', { ...credentials, ...overrides });
  return AuthResponseSchema.parse(response.json());
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('signup', () => {
  it('creates an account and returns a session without leaking the password hash', async () => {
    const response = await post('/auth/signup', { ...credentials, email: ' Trader@Example.com ' });

    expect(response.statusCode).toBe(201);
    const body = AuthResponseSchema.parse(response.json());
    expect(body.user).toMatchObject({ email: 'trader@example.com', displayName: 'Pro Trader' });
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain(credentials.password);
  });

  it('rejects a duplicate email', async () => {
    await signup();
    const response = await post('/auth/signup', credentials);

    expect(response.statusCode).toBe(409);
    expect(errorCode(response.json())).toBe('email_taken');
  });

  it.each([
    ['a weak password', { password: 'short' }],
    ['a malformed email', { email: 'nope' }],
  ])('rejects %s with a validation error', async (_, overrides) => {
    const response = await post('/auth/signup', { ...credentials, ...overrides });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response.json())).toBe('validation_failed');
  });
});

describe('login', () => {
  it('returns a session for the right password', async () => {
    const { user } = await signup();
    const response = await post('/auth/login', {
      email: credentials.email,
      password: credentials.password,
    });

    expect(response.statusCode).toBe(200);
    expect(AuthResponseSchema.parse(response.json()).user).toEqual(user);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    await signup();
    const wrongPassword = await post('/auth/login', {
      email: credentials.email,
      password: 'wrong password',
    });
    const unknownEmail = await post('/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password',
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(errorCode(wrongPassword.json())).toBe('invalid_credentials');
  });

  it('rate limits repeated attempts', async () => {
    const attempts = [];
    for (let i = 0; i < 6; i += 1) {
      attempts.push(await post('/auth/login', { email: credentials.email, password: 'guess' }));
    }

    expect(attempts.at(-1)?.statusCode).toBe(429);
    expect(errorCode(attempts.at(-1)?.json())).toBe('rate_limited');
  });
});

describe('protected routes', () => {
  it.each([
    ['no token', {}],
    ['a forged token', { authorization: 'Bearer not.a.token' }],
  ])('rejects %s', async (_, headers) => {
    const response = await app.inject({ method: 'GET', url: '/me', headers });

    expect(response.statusCode).toBe(401);
    expect(errorCode(response.json())).toBe('unauthorized');
  });

  it('rejects a valid token whose account no longer exists', async () => {
    const { token, user } = await signup();
    users.remove(user.id);

    const response = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });

    expect(response.statusCode).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const { token, user } = await signup();
    const response = await app.inject({ method: 'GET', url: '/me', headers: bearer(token) });

    expect(response.json()).toEqual(user);
  });
});

describe('settings', () => {
  it('starts from defaults and stores changes per user', async () => {
    const alice = await signup();
    const bob = await signup({ email: 'bob@example.com' });
    const aliceSettings = {
      ...DEFAULT_USER_SETTINGS,
      favourites: ['ETHUSDT'],
      binaryProtocol: true,
    };

    const initial = await app.inject({
      method: 'GET',
      url: '/me/settings',
      headers: bearer(alice.token),
    });
    expect(UserSettingsSchema.parse(initial.json())).toEqual(DEFAULT_USER_SETTINGS);

    const saved = await app.inject({
      method: 'PUT',
      url: '/me/settings',
      headers: bearer(alice.token),
      payload: aliceSettings,
    });
    expect(saved.statusCode).toBe(200);

    const aliceAfter = await app.inject({
      method: 'GET',
      url: '/me/settings',
      headers: bearer(alice.token),
    });
    const bobAfter = await app.inject({
      method: 'GET',
      url: '/me/settings',
      headers: bearer(bob.token),
    });
    expect(aliceAfter.json()).toEqual(aliceSettings);
    expect(bobAfter.json()).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('rejects settings that do not match the contract', async () => {
    const { token } = await signup();
    const response = await app.inject({
      method: 'PUT',
      url: '/me/settings',
      headers: bearer(token),
      payload: { ...DEFAULT_USER_SETTINGS, selectedPair: 'btc/usdt' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('unknown routes', () => {
  it('uses the same error envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(errorCode(response.json())).toBe('not_found');
  });
});
