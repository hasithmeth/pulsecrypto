import { describe, expect, it } from 'vitest';
import { LoginRequestSchema, SignupRequestSchema, UserSettingsSchema } from './auth';

describe('SignupRequestSchema', () => {
  it('normalises the email and trims the display name', () => {
    const parsed = SignupRequestSchema.parse({
      email: '  Trader@Example.COM ',
      password: 'correct horse',
      displayName: '  Pro Trader ',
    });
    expect(parsed).toEqual({
      email: 'trader@example.com',
      password: 'correct horse',
      displayName: 'Pro Trader',
    });
  });

  it.each([
    ['a malformed email', { email: 'nope', password: 'longenough', displayName: 'Trader' }],
    ['a short password', { email: 'a@b.co', password: 'short', displayName: 'Trader' }],
    ['a one-letter name', { email: 'a@b.co', password: 'longenough', displayName: 'T' }],
  ])('rejects %s', (_, body) => {
    expect(SignupRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('LoginRequestSchema', () => {
  it('does not apply signup password rules, so old accounts can still log in', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
  });
});

describe('UserSettingsSchema', () => {
  it('rejects malformed pair symbols', () => {
    const result = UserSettingsSchema.safeParse({
      favourites: ['btc/usdt'],
      selectedPair: 'BTCUSDT',
      streamIntervalMs: null,
      binaryProtocol: false,
      adaptivePolling: false,
    });
    expect(result.success).toBe(false);
  });
});
