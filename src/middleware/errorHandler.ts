import { FastifyReply, FastifyRequest } from 'fastify';
import { Sentry } from '../instrument.js';

export function errorHandler(error: any, request: FastifyRequest, reply: FastifyReply) {
  // If an error includes a structured Problem Details object, use it
  if (error && typeof error === 'object' && error.problem) {
    const problem = error.problem;
    const status = error.statusCode || problem.status || 500;
    if (status >= 500) {
      Sentry.captureException(error);
    }
    reply.status(status).send(problem);
    return;
  }

  // Zod errors thrown directly
  if (error?.name === 'ZodError' && Array.isArray(error.errors)) {
    const errors = error.errors.map((e: any) => ({
      path: (e.path || []).join('.'),
      message: e.message,
      code: e.code
    }));

    const problem = {
      type: 'https://drivesync.me/errors/validation-error',
      title: 'Validation Error',
      status: 422,
      detail: errors.map((e: any) => `${e.path}: ${e.message}`).join('; '),
      instance: request.url,
      errors
    };

    reply.status(422).send(problem);
    return;
  }

  // If error contains a statusCode, map to Problem Details
  if (error?.statusCode) {
    const problem = {
      type: 'https://drivesync.me/errors/internal-error',
      title: error.message || 'Error',
      status: error.statusCode || 500,
      detail: error.message || String(error),
      instance: request.url
    };
    reply.status(problem.status).send(problem);
    return;
  }

  // Fallback: 500 Internal Server Error
  Sentry.captureException(error);
  const problem = {
    type: 'https://drivesync.me/errors/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    detail: error?.message || 'Unexpected error',
    instance: request.url
  };
  reply.status(500).send(problem);
}
