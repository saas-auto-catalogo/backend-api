import { Redis } from 'ioredis';
import { redisClient } from '../redis/redis-client.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  totalHits: number;
}

export interface RateLimitOptions {
  windowSeconds?: number;
  maxRequests?: number;
}

/**
 * Serviço de Rate Limiting Distribuído baseado em Redis com Sliding Window.
 * Protege endpoints públicos contra requisições abusivas e servidores de DMS contra sobrecarga.
 */
export class RateLimiterService {
  private redis: Redis;

  constructor(customRedis?: Redis) {
    this.redis = customRedis || redisClient;
  }

  /**
   * Valida se a requisição de um determinado identificador (IP, Token, API Key) está dentro do limite permitido
   * utilizando o algoritmo Sliding Window Log com Redis Sorted Sets.
   *
   * @param identifier IP do cliente ou Token
   * @param options Configurações de limite (padrão: 120 req / 60s)
   */
  async checkRateLimit(
    identifier: string,
    options: RateLimitOptions = {}
  ): Promise<RateLimitResult> {
    const windowSeconds = options.windowSeconds || 60;
    const maxRequests = options.maxRequests || 120;
    const key = `ratelimit:sliding:${identifier}`;

    const now = Date.now();
    const clearBefore = now - windowSeconds * 1000;
    const uniqueMember = `${now}-${Math.random()}`;

    const pipeline = this.redis.pipeline();
    // 1. Remove requisições fora da janela de tempo atual
    pipeline.zremrangebyscore(key, 0, clearBefore);
    // 2. Registra a requisição atual com timestamp como score
    pipeline.zadd(key, now, uniqueMember);
    // 3. Obtém a contagem de requisições na janela ativa
    pipeline.zcard(key);
    // 4. Renova a expiração da chave para evitar acúmulo no Redis
    pipeline.expire(key, windowSeconds * 2);

    const results = await pipeline.exec();
    const currentHits = (results?.[2]?.[1] as number) || 1;

    const allowed = currentHits <= maxRequests;
    const remaining = Math.max(0, maxRequests - currentHits);
    const resetTimeMs = now + windowSeconds * 1000;

    return {
      allowed,
      limit: maxRequests,
      remaining,
      resetTimeMs,
      totalHits: currentHits
    };
  }

  /**
   * Controle de concorrência por host de DMS parceiro (ex: AutoCerto, Altimus).
   * Garante que não sejam abertas mais de `maxConcurrent` requisições simultâneas contra o mesmo servidor.
   *
   * @param host Domínio ou IP do servidor DMS
   * @param maxConcurrent Máximo de conexões concorrentes simultâneas (padrão: 3)
   */
  async acquireHostSlot(host: string, maxConcurrent: number = 3, lockTtlSeconds: number = 60): Promise<boolean> {
    const key = `ratelimit:host_concurrency:${host}`;
    const currentActive = await this.redis.incr(key);

    if (currentActive === 1) {
      await this.redis.expire(key, lockTtlSeconds);
    }

    if (currentActive > maxConcurrent) {
      // Reverte o incremento caso exceda o limite
      await this.redis.decr(key);
      return false;
    }

    return true;
  }

  /**
   * Libera o slot de concorrência após conclusão do download/parsing do feed no host parceiro.
   */
  async releaseHostSlot(host: string): Promise<void> {
    const key = `ratelimit:host_concurrency:${host}`;
    const remaining = await this.redis.decr(key);
    if (remaining <= 0) {
      await this.redis.del(key);
    }
  }

  /**
   * Limpa o histórico de rate limit para um determinado identificador (útil para testes ou desbloqueio manual)
   */
  async resetLimit(identifier: string): Promise<void> {
    const key = `ratelimit:sliding:${identifier}`;
    await this.redis.del(key);
  }
}

export const rateLimiterService = new RateLimiterService();
export default rateLimiterService;
