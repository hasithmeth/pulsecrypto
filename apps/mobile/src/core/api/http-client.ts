import { ApiErrorResponseSchema, type ApiErrorCode } from '@pulsecrypto/contracts';
import type { z } from 'zod';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'contract';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    /** Machine-readable reason from the gateway's error envelope, when it sent one. */
    readonly code?: ApiErrorCode,
  ) {
    super(message);
  }

  get isUnauthorized(): boolean {
    return this.status === 401 && this.code !== 'invalid_credentials';
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT';
  readonly body?: unknown;
  readonly token?: string | null;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

async function toApiError(response: Response): Promise<ApiError> {
  const envelope = ApiErrorResponseSchema.safeParse(await response.json().catch(() => undefined));
  return envelope.success
    ? new ApiError('http', envelope.data.error.message, response.status, envelope.data.error.code)
    : new ApiError('http', `Request failed with status ${response.status}`, response.status);
}

export async function requestJson<T>(
  url: string,
  schema: z.ZodType<T>,
  { method = 'GET', body, token, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
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
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await toApiError(response);

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
