import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { ApiError, ApiErrorCode } from '@racing-gang/config/protocol';

/** Error yang dikirim ke client sebagai `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new AppError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Perlu login') => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);

const body = (code: ApiErrorCode, message: string): ApiError => ({ error: { code, message } });

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send(body(err.code, err.message));
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return reply.status(400).send(body('BAD_REQUEST', msg));
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) return reply.status(429).send(body('RATE_LIMITED', 'Terlalu banyak permintaan'));
    if (status === 401) return reply.status(401).send(body('UNAUTHORIZED', 'Token tidak valid atau kedaluwarsa'));
    if (status < 500) return reply.status(status).send(body('BAD_REQUEST', err.message));
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('INTERNAL', 'Terjadi kesalahan di server'));
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send(body('NOT_FOUND', 'Endpoint tidak ditemukan')));
}
