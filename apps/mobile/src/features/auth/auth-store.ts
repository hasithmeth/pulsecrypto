import {
  AuthResponseSchema,
  type LoginRequest,
  type SignupRequest,
  type User,
} from '@pulsecrypto/contracts';
import { create } from 'zustand';
import { requestJson } from '@/core/api/http-client';
import { gateway } from '@/core/config/gateway';
import { sessionStorage, type Session } from './session-storage';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthStore {
  readonly status: AuthStatus;
  readonly user: User | null;
  readonly token: string | null;
  readonly restore: () => Promise<void>;
  readonly signIn: (credentials: LoginRequest) => Promise<void>;
  readonly signUp: (details: SignupRequest) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SIGNED_OUT = { status: 'signedOut', user: null, token: null } as const;

export const useAuthStore = create<AuthStore>((set) => {
  const open = async (session: Session): Promise<void> => {
    await sessionStorage.write(session);
    set({ status: 'signedIn', ...session });
  };

  return {
    status: 'restoring',
    user: null,
    token: null,

    /** Trusts the stored session without a network call, so the app opens offline. */
    restore: async () => {
      const session = await sessionStorage.read();
      set(session ? { status: 'signedIn', ...session } : SIGNED_OUT);
    },

    signIn: async (credentials) => {
      await open(
        await requestJson(gateway.loginUrl, AuthResponseSchema, {
          method: 'POST',
          body: credentials,
        }),
      );
    },

    signUp: async (details) => {
      await open(
        await requestJson(gateway.signupUrl, AuthResponseSchema, { method: 'POST', body: details }),
      );
    },

    signOut: async () => {
      set(SIGNED_OUT);
      await sessionStorage.clear();
    },
  };
});

export const getSessionToken = (): string | null => useAuthStore.getState().token;
