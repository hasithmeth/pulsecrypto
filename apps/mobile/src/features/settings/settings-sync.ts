import {
  DEFAULT_USER_SETTINGS,
  UserSettingsSchema,
  type UserSettings,
} from '@pulsecrypto/contracts';
import { ApiError, requestJson } from '@/core/api/http-client';
import { gateway } from '@/core/config/gateway';
import { appStorage } from '@/core/storage/app-storage';
import { selectSettings, useUserSettingsStore } from './user-settings-store';

export interface SettingsSession {
  readonly userId: string;
  readonly token: string;
  readonly onUnauthorized: () => void;
}

const PUSH_DEBOUNCE_MS = 600;
const cacheKey = (userId: string): string => `pulsecrypto.settings.${userId}`;

async function readCache(userId: string): Promise<UserSettings | null> {
  try {
    const raw = await appStorage.getItem(cacheKey(userId));
    const parsed = raw ? UserSettingsSchema.safeParse(JSON.parse(raw)) : undefined;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Keeps one user's settings in step across three places. The device cache makes
 * the app usable offline, the server makes settings follow the user to another
 * device, and the store is what the UI reads.
 *
 * On open the cache is applied first and the server then wins. Afterwards only
 * local edits are written back, debounced, and a failed write is retried by
 * `flush`, which the app calls when the gateway becomes reachable again.
 */
export function openSettingsSync(session: SettingsSession): {
  flush: () => void;
  close: () => void;
} {
  const store = useUserSettingsStore;
  const lifecycle = { closed: false };
  // Read through a function: the flag flips while requests are in flight, which
  // control-flow narrowing of a plain property would not account for.
  const isClosed = (): boolean => lifecycle.closed;
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  let pushedRevision = store.getState().localRevision;

  const push = async (): Promise<void> => {
    const { localRevision } = store.getState();
    if (isClosed() || localRevision === pushedRevision) return;
    try {
      await requestJson(gateway.settingsUrl, UserSettingsSchema, {
        method: 'PUT',
        token: session.token,
        body: selectSettings(store.getState()),
      });
      pushedRevision = localRevision;
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) session.onUnauthorized();
    }
  };

  const schedulePush = (): void => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void push(), PUSH_DEBOUNCE_MS);
  };

  const load = async (): Promise<void> => {
    store.getState().replace((await readCache(session.userId)) ?? DEFAULT_USER_SETTINGS);
    if (isClosed()) return;
    try {
      const remote = await requestJson(gateway.settingsUrl, UserSettingsSchema, {
        token: session.token,
      });
      const editedMeanwhile = store.getState().localRevision !== pushedRevision;
      if (!isClosed() && !editedMeanwhile) store.getState().replace(remote);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) session.onUnauthorized();
    }
  };

  const unsubscribe = store.subscribe((state, previous) => {
    void appStorage.setItem(cacheKey(session.userId), JSON.stringify(selectSettings(state)));
    if (state.localRevision !== previous.localRevision) schedulePush();
  });

  void load();

  return {
    flush: () => void push(),
    close: () => {
      lifecycle.closed = true;
      clearTimeout(pushTimer);
      unsubscribe();
      store.getState().replace(DEFAULT_USER_SETTINGS);
    },
  };
}
