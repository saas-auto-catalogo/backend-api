import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import { createRedisConnection } from '../redis/redis-client.js';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  QueueName,
  QueuePriority,
  XmlIngestionJobData,
  MetaSyncJobData,
  AiBlogJobData
} from './queue-types.js';

// Opções padrão para todos os jobs enfileirados
const defaultJobOptions: JobsOptions = {
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 2000 // 2s -> 4s -> 8s -> 16s
  },
  removeOnComplete: {
    age: 24 * 3600, // mantém histórico de 24 horas
    count: 1000
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // mantém falhas por 7 dias para auditoria/DLQ
    count: 5000
  }
};

/**
 * Criação da configuração base para instâncias de fila do BullMQ
 */
function createQueueOptions(): QueueOptions {
  return {
    connection: createRedisConnection(),
    defaultJobOptions
  };
}

/**
 * Instâncias centralizadas das filas BullMQ
 */
export const xmlIngestionQueue = new Queue<XmlIngestionJobData>(
  QUEUE_NAMES.XML_INGESTION,
  createQueueOptions()
);

export const metaSyncQueue = new Queue<MetaSyncJobData>(
  QUEUE_NAMES.META_SYNC,
  createQueueOptions()
);

export const aiBlogQueue = new Queue<AiBlogJobData>(
  QUEUE_NAMES.AI_BLOG,
  createQueueOptions()
);

export const queuesMap: Record<QueueName, Queue<any>> = {
  [QUEUE_NAMES.XML_INGESTION]: xmlIngestionQueue,
  [QUEUE_NAMES.META_SYNC]: metaSyncQueue,
  [QUEUE_NAMES.AI_BLOG]: aiBlogQueue
};

/**
 * Despacha um job de sincronização de feed XML/JSON com prioridade configurável
 */
export async function dispatchSyncFeed(
  data: XmlIngestionJobData,
  priority: QueuePriority = QueuePriority.NORMAL
) {
  const jobId = `sync-feed-${data.workspaceId}-${data.feedConfigId}-${Date.now()}`;
  return xmlIngestionQueue.add(JOB_NAMES.SYNC_FEED, data, {
    jobId,
    priority
  });
}

/** @deprecated Use dispatchSyncFeed */
export const dispatchXmlIngestion = dispatchSyncFeed;

/**
 * Despacha um job de sincronização com o Meta Ads DAA
 */
export async function dispatchMetaSync(
  data: MetaSyncJobData,
  priority: QueuePriority = QueuePriority.NORMAL
) {
  const jobId = `meta-sync-${data.workspaceId}-${data.syncType.toLowerCase()}-${Date.now()}`;
  return metaSyncQueue.add(JOB_NAMES.SYNC_META_CATALOG, data, {
    jobId,
    priority
  });
}

/**
 * Despacha um job de geração/publicação de artigo IA
 */
export async function dispatchAiBlog(
  data: AiBlogJobData,
  priority: QueuePriority = QueuePriority.NORMAL
) {
  const jobId = `ai-blog-${Date.now()}`;
  return aiBlogQueue.add(JOB_NAMES.GENERATE_BLOG_POST, data, {
    jobId,
    priority
  });
}

/**
 * Obtém métricas em tempo real de contadores de uma fila
 */
export async function getQueueMetrics(queueName: QueueName) {
  const queue = queuesMap[queueName];
  if (!queue) {
    throw new Error(`Fila não encontrada: ${queueName}`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed
  };
}

/**
 * Encerra graciosamente todas as conexões de filas do BullMQ
 */
export async function closeAllQueues() {
  await Promise.all([
    xmlIngestionQueue.close(),
    metaSyncQueue.close(),
    aiBlogQueue.close()
  ]);
}
