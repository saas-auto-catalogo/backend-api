import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  loginHandler,
  registerHandler,
  refreshHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  getMeHandler,
  patchOnboardingHandler,
} from './auth.controller.js';
import { authenticate } from './auth.middleware.js';
import { validate } from '../../middleware/validation.js';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateOnboardingSchema,
} from '../../schemas/auth.js';
import { rateLimiterService } from '../../infra/security/rate-limiter.service.js';

async function loginRateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const identifier = `auth:login:${request.ip}`;
  const result = await rateLimiterService.checkRateLimit(identifier, {
    windowSeconds: 900,
    maxRequests: 10,
  });

  reply.header('X-RateLimit-Limit', result.limit);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetTimeMs / 1000));

  if (!result.allowed) {
    reply.status(429).send({
      type: 'https://autocatalogo.com.br/errors/rate-limited',
      title: 'Limite de Requisicoes Excedido',
      status: 429,
      detail: `Muitas tentativas de login. Tente novamente em ${Math.ceil((result.resetTimeMs - Date.now()) / 60000)} minuto(s).`,
      instance: request.url,
    });
  }
}

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  server.post(
    '/api/v1/auth/login',
    { preHandler: [loginRateLimit, validate(loginSchema, 'body')] },
    async (req, reply) => loginHandler(req as any, reply),
  );

  server.post(
    '/api/v1/auth/register',
    { preHandler: [loginRateLimit, validate(registerSchema, 'body')] },
    async (req, reply) => registerHandler(req as any, reply),
  );

  server.post(
    '/api/v1/auth/refresh',
    refreshHandler,
  );

  server.post(
    '/api/v1/auth/logout',
    { preHandler: [authenticate] },
    logoutHandler,
  );

  server.post(
    '/api/v1/auth/forgot-password',
    { preHandler: [loginRateLimit, validate(forgotPasswordSchema, 'body')] },
    async (req, reply) => forgotPasswordHandler(req as any, reply),
  );

  server.post(
    '/api/v1/auth/reset-password',
    { preHandler: [validate(resetPasswordSchema, 'body')] },
    async (req, reply) => resetPasswordHandler(req as any, reply),
  );

  server.get(
    '/api/v1/auth/me',
    { preHandler: [authenticate] },
    getMeHandler,
  );

  server.patch(
    '/api/v1/auth/me/onboarding',
    { preHandler: [authenticate, validate(updateOnboardingSchema, 'body')] },
    async (req, reply) => patchOnboardingHandler(req as any, reply),
  );
}
