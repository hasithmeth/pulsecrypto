import { z } from 'zod';
import { PairSymbolSchema } from './market';

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const PasswordSchema = z.string().min(8).max(128);
export const DisplayNameSchema = z.string().trim().min(2).max(40);

export const SignupRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: DisplayNameSchema,
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UserSchema = z.object({
  id: z.string(),
  /** Short human-facing account number shown in the app. */
  publicId: z.string(),
  email: z.string(),
  displayName: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const UserSettingsSchema = z.object({
  favourites: z.array(PairSymbolSchema).max(200),
  selectedPair: PairSymbolSchema,
  streamIntervalMs: z.number().int().positive().nullable(),
  binaryProtocol: z.boolean(),
  adaptivePolling: z.boolean(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  favourites: [],
  selectedPair: 'BTCUSDT',
  streamIntervalMs: null,
  binaryProtocol: false,
  adaptivePolling: false,
};

export const ApiErrorCodeSchema = z.enum([
  'validation_failed',
  'email_taken',
  'invalid_credentials',
  'unauthorized',
  'rate_limited',
  'not_found',
  'internal_error',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
