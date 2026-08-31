import { Redis } from 'ioredis';
import { redisClient } from '../redis/redis-client.js';

// TTL padrão de 15 minutos (900 segundos) conforme RNF do SaaS
export const DEFAULT_FEED_CACHE_TTL_SECONDS = 15 * 60;

export interface FeedCacheEntry {
  xml: string;
  etag: string;
  generatedAt: string;
  workspaceId?: string;
}

/**
 * Serviço de Cache Redis de Alta Performance para Feeds XML do Meta Ads DAA.
 * Garante respostas com latência < 250ms (p50) e suporte a invalidação sob demanda.
 */
export class FeedCacheService {
  private redis: Redis;

  constructor(customRedis?: Redis) {
    this.redis = customRedis || redisClient;
  }

  private buildKey(tokenHash: string): string {
    return `feed_cache:token:${tokenHash}`;
  }

  private buildWorkspaceTokensKey(workspaceId: string): string {
    return `feed_cache:workspace:${workspaceId}:tokens`;
  }

  /**
   * Obtém o XML do feed armazenado em cache para o tokenHash fornecido.
   */
  async getFeedXml(tokenHash: string): Promise<FeedCacheEntry | null> {
    const key = this.buildKey(tokenHash);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as FeedCacheEntry;
    } catch {
      // Fallback se armazenado como string pura
      return {
        xml: data,
        etag: `W/"${Buffer.from(tokenHash).toString('base64').substring(0, 16)}"`,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Grava o conteúdo XML gerado no cache do Redis com TTL de 15 minutos e indexação por workspace.
   */
  async setFeedXml(
    tokenHash: string,
    xmlContent: string,
    workspaceId?: string,
    ttlSeconds: number = DEFAULT_FEED_CACHE_TTL_SECONDS
  ): Promise<void> {
    const key = this.buildKey(tokenHash);
    const entry: FeedCacheEntry = {
      xml: xmlContent,
      etag: `"${Buffer.from(tokenHash + Date.now()).toString('base64').substring(0, 20)}"`,
      generatedAt: new Date().toISOString(),
      workspaceId
    };

    const serialized = JSON.stringify(entry);

    if (workspaceId) {
      const wsKey = this.buildWorkspaceTokensKey(workspaceId);
      const pipeline = this.redis.pipeline();
      pipeline.setex(key, ttlSeconds, serialized);
      pipeline.sadd(wsKey, tokenHash);
      pipeline.expire(wsKey, ttlSeconds * 2);
      await pipeline.exec();
    } else {
      await this.redis.setex(key, ttlSeconds, serialized);
    }
  }

  /**
   * Invalida sob demanda o cache de um token específico.
   */
  async invalidateFeedXml(tokenHash: string): Promise<boolean> {
    const key = this.buildKey(tokenHash);
    const deletedCount = await this.redis.del(key);
    return deletedCount > 0;
  }

  /**
   * Invalida sob demanda todos os feeds XML pertencentes a um determinado workspace
   * (ex: disparado após conclusão de sincronização e detecção de diff de estoque).
   */
  async invalidateWorkspaceFeeds(workspaceId: string): Promise<number> {
    const wsKey = this.buildWorkspaceTokensKey(workspaceId);
    const tokens = await this.redis.smembers(wsKey);

    if (!tokens || tokens.length === 0) {
      return 0;
    }

    const keysToDelete = tokens.map((tok) => this.buildKey(tok));
    keysToDelete.push(wsKey);

    const deletedCount = await this.redis.del(...keysToDelete);
    return deletedCount;
  }

  /**
   * Retorna o TTL restante em segundos para a chave em cache
   */
  async getCacheTtl(tokenHash: string): Promise<number> {
    const key = this.buildKey(tokenHash);
    return this.redis.ttl(key);
  }
}

export const feedCacheService = new FeedCacheService();
export default feedCacheService;
