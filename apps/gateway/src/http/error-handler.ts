import type { ApiErrorCode, ApiErrorResponse } from '@pulsecrypto/contracts';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { InvalidCredentialsError } from '../auth/auth-service';
import { EmailTakenError } from '../auth/user-repository';

const envelope = (code: ApiErrorCode, message: string): ApiErrorResponse => ({
  error: { code, message },
});

interface HttpError {
  readonly statusCode?: number;
  readonly code?: string;
}

/** Every failure leaves the gateway in one shape, so clients branch on `error.code`, never on prose. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(envelope('not_found', 'Resource not found')),
  );

  app.setErrorHandler((error: Error & HttpError, request, reply) => {
    if (error instanceof ZodError) {
      const [issue] = error.issues;
      const field = issue?.path.join('.');
      const message = issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'Invalid request';
      return reply.code(400).send(envelope('validation_failed', message));
    }
    if (error instanceof EmailTakenError) {
      return reply
        .code(409)
        .send(envelope('email_taken', 'An account with this email already exists'));
    }
    if (error instanceof InvalidCredentialsError) {
      return reply
        .code(401)
        .send(envelope('invalid_credentials', 'Email or password is incorrect'));
    }
    if (error.statusCode === 429) {
      return reply.code(429).send(envelope('rate_limited', 'Too many attempts. Try again shortly'));
    }
    if (error.statusCode === 401 || error.code?.startsWith('FST_JWT')) {
      return reply.code(401).send(envelope('unauthorized', 'Sign in to continue'));
    }
    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply.code(error.statusCode).send(envelope('validation_failed', error.message));
    }

    request.log.error({ err: error }, 'unhandled request error');
    return reply.code(500).send(envelope('internal_error', 'Something went wrong'));
  });
}
