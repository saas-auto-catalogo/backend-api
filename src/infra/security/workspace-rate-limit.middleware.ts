import { FastifyRequest, FastifyReply } from 'fastify';
import { rateLimiterService } from './rate-limiter.service.js';

export interface WorkspaceRateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
}

export function workspaceRateLimit(
  scope: string,
  options: WorkspaceRateLimitOptions = {}
) {
  const windowSeconds = options.windowSeconds ?? 60;
  const maxRequests = options.maxRequests ?? 20;

  return async function workspaceRateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { workspaceId } = request.params as { workspaceId: string };
    const identifier = `${scope}:${workspaceId}`;

    const result = await rateLimiterService.checkRateLimit(identifier, {
      windowSeconds,
      maxRequests,
    });

    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTimeMs / 1000));

    if (!result.allowed) {
      reply.status(429).send({
        type: 'https://autocatalogo.com.br/errors/rate-limited',
        title: 'Limite de Requisicoes Excedido',
        status: 429,
        detail: 'Limite de requisicoes do workspace excedido. Tente novamente em instantes.',
        instance: request.url,
      });
    }
  };
}
