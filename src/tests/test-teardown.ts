import { redisClient } from '../infra/redis/redis-client.js';
import { prisma } from '../lib/prisma.js';
import { closeAllQueues } from '../infra/queues/queue-manager.js';

export async function teardownIntegrationTest(): Promise<void> {
  await closeAllQueues().catch(() => undefined);
  redisClient.disconnect();
  await prisma.$disconnect().catch(() => undefined);
}
