import 'dotenv/config';
import { createSyncFeedWorker } from '../infra/queues/workers/sync-feed.worker.js';
import { QUEUE_NAMES } from '../infra/queues/queue-types.js';

const concurrency = parseInt(process.env.SYNC_FEED_WORKER_CONCURRENCY || '2', 10);

const worker = createSyncFeedWorker(concurrency);

console.log(`[SyncFeedWorker] Iniciado — fila: ${QUEUE_NAMES.XML_INGESTION}, concurrency: ${concurrency}`);

async function shutdown(signal: string) {
  console.log(`[SyncFeedWorker] Recebido ${signal}, encerrando...`);
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
