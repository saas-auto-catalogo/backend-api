import { redisClient } from '../infra/redis/redis-client.js';
import { prisma } from '../lib/prisma.js';
import { closeAllQueues } from '../infra/queues/queue-manager.js';
import { rateLimiterService } from '../infra/security/rate-limiter.service.js';

export async function resetAuthRateLimits(): Promise<void> {
  await rateLimiterService.resetLimit('auth:login:127.0.0.1').catch(() => undefined);
}

export async function teardownIntegrationTest(): Promise<void> {
  await closeAllQueues().catch(() => undefined);
  redisClient.disconnect();
  await prisma.$disconnect().catch(() => undefined);
}
