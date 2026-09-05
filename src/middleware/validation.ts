import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

type Source = 'body' | 'params' | 'query';

export function validate(schema: ZodSchema<any>, source: Source = 'body') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = schema.parse((request as any)[source]);
      (request as any)[source] = parsed;
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          path: (e.path || []).join('.'),
          message: e.message,
          code: e.code
        }));

        const problem = {
          type: 'https://drivesync.me/errors/validation-error',
          title: 'Validation Error',
          status: 422,
          detail: errors.map((e) => `${e.path}: ${e.message}`).join('; '),
          instance: (request as any).url,
          errors
        };

        const error = new Error('Validation Error');
        (error as any).statusCode = 422;
        (error as any).problem = problem;
        throw error;
      }
      throw err;
    }
  };
}
