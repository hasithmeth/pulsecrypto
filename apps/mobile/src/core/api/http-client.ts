import type { z } from 'zod';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'contract';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

interface RequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

export async function getJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = { fired: false };
  const timer = setTimeout(() => {
    timeout.fired = true;
    controller.abort();
  }, timeoutMs);
  const abort = (): void => {
    controller.abort();
  };
  signal?.addEventListener('abort', abort);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new ApiError('http', `Request failed with status ${response.status}`, response.status);
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new ApiError('contract', 'Response did not match the contract');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timeout.fired) throw new ApiError('timeout', 'The gateway took too long to respond');
    throw new ApiError('network', 'Could not reach the gateway');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
