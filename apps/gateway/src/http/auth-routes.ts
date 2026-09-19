import rateLimit from '@fastify/rate-limit';
import {
  LOGIN_PATH,
  LoginRequestSchema,
  ME_PATH,
  MY_SETTINGS_PATH,
  SIGNUP_PATH,
  SignupRequestSchema,
  UserSettingsSchema,
  type AuthResponse,
  type User,
  type UserSettings,
} from '@pulsecrypto/contracts';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { toPublicUser, type AuthService } from '../auth/auth-service';
import type { StoredUser } from '../auth/user-repository';
import type { Config } from '../config/env';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

interface AuthRoutesOptions {
  readonly auth: AuthService;
  readonly config: Config['auth'];
}

const RATE_LIMIT_WINDOW_MS = 60_000;

class UnauthorizedError extends Error {
  readonly statusCode = 401;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, { auth, config }) => {
  await app.register(rateLimit, { global: false });

  // Credential endpoints are the only brute-force surface, so only they are limited.
  const credentialRoute = {
    config: { rateLimit: { max: config.rateLimitMax, timeWindow: RATE_LIMIT_WINDOW_MS } },
  };

  const issue = (user: StoredUser): AuthResponse => ({
    token: app.jwt.sign({ sub: user.id }, { expiresIn: config.tokenTtl }),
    user: toPublicUser(user),
  });

  /** A valid token for a deleted account is still unauthorised. */
  const currentUser = async (request: FastifyRequest): Promise<StoredUser> => {
    await request.jwtVerify();
    const user = await auth.findUser(request.user.sub);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    return user;
  };

  app.post(SIGNUP_PATH, credentialRoute, async (request, reply): Promise<AuthResponse> => {
    const user = await auth.signup(SignupRequestSchema.parse(request.body));
    void reply.code(201);
    return issue(user);
  });

  app.post(LOGIN_PATH, credentialRoute, async (request): Promise<AuthResponse> =>
    issue(await auth.login(LoginRequestSchema.parse(request.body))),
  );

  app.get(ME_PATH, async (request): Promise<User> => toPublicUser(await currentUser(request)));

  app.get(
    MY_SETTINGS_PATH,
    async (request): Promise<UserSettings> => (await currentUser(request)).settings,
  );

  app.put(MY_SETTINGS_PATH, async (request): Promise<UserSettings> => {
    const user = await currentUser(request);
    const settings = UserSettingsSchema.parse(request.body);
    return (await auth.saveSettings(user.id, settings))?.settings ?? settings;
  });
};
