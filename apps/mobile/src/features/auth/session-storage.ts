import { UserSchema, type User } from '@pulsecrypto/contracts';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const SESSION_KEY = 'pulsecrypto.session';

const SessionSchema = z.object({ token: z.string().min(1), user: UserSchema });
export interface Session {
  readonly token: string;
  readonly user: User;
}

/** The token is a credential, so it lives in the Keychain / Keystore rather than plain storage. */
export const sessionStorage = {
  async read(): Promise<Session | null> {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      const parsed = raw ? SessionSchema.safeParse(JSON.parse(raw)) : undefined;
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  write: (session: Session): Promise<void> =>
    SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(SESSION_KEY),
};
