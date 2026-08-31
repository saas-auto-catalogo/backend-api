import { Redis, RedisOptions } from 'ioredis';

// URL padrão do Redis obtida do ambiente
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Opções recomendadas de conexão Redis para compatibilidade com BullMQ e IORedis.
 */
export const defaultRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null, // Obrigatório para BullMQ
  enableReadyCheck: false,
  retryStrategy(times: number) {
    // Retry exponencial com limite máximo de 3 segundos entre tentativas
    const delay = Math.min(times * 100, 3000);
    return delay;
  }
};

/**
 * Cria uma nova conexão Redis isolada (útil para instâncias de Workers e Subscribers do BullMQ).
 */
export function createRedisConnection(customOptions?: Partial<RedisOptions>): Redis {
  const options: RedisOptions = {
    ...defaultRedisOptions,
    ...customOptions
  };

  const client = new Redis(REDIS_URL, options);

  client.on('error', (err) => {
    // Log silencioso em desenvolvimento caso o Redis não esteja ativo localmente
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`⚠️ [Redis] Aviso de conexão: ${err.message}`);
    }
  });

  return client;
}

// Instância compartilhada para operações gerais de cache e rate limiting
export const redisClient = createRedisConnection();

export default redisClient;
