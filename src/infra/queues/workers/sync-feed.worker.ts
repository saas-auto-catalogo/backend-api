import { Job, Worker } from 'bullmq';
import { createRedisConnection } from '../../redis/redis-client.js';
import { JOB_NAMES, QUEUE_NAMES, XmlIngestionJobData } from '../queue-types.js';
import { downloadFeedStream } from '../../../modules/xml-ingestion/feed-downloader.js';
import { XmlStreamParser } from '../../../modules/xml-ingestion/stream-parser.js';
import { AutoMatchingEngine, CanonicalVehicleOutput } from '../../../modules/normalization/auto-matching.engine.js';
import { StockSyncService } from '../../../modules/stock-diff/stock-sync.service.js';

export interface SyncFeedJobResult {
  syncHistoryId?: string;
  status: string;
  totalIngested: number;
  totalCreated: number;
  totalUpdated: number;
  totalRemoved: number;
  durationMs: number;
}

function validateJobData(data: XmlIngestionJobData): void {
  if (!data.workspaceId || !data.feedConfigId || !data.feedUrl || !data.sourceType) {
    throw new Error('Payload do job SYNC_FEED incompleto: workspaceId, feedConfigId, feedUrl e sourceType são obrigatórios.');
  }
}

async function processSyncFeedJob(job: Job<XmlIngestionJobData>): Promise<SyncFeedJobResult> {
  const data = job.data;
  validateJobData(data);

  const { workspaceId, feedConfigId, feedUrl, sourceType, dealershipId } = data;

  await job.updateProgress(5);

  const downloadResult = await downloadFeedStream(feedUrl);
  await job.updateProgress(10);

  const rawVehicles: Record<string, unknown>[] = [];

  await XmlStreamParser.parseStream(
    downloadResult.stream,
    async (vehicle) => {
      rawVehicles.push(vehicle);
      if (rawVehicles.length % 50 === 0) {
        await job.updateProgress(Math.min(10 + Math.floor(rawVehicles.length / 10), 45));
      }
    }
  );

  await job.updateProgress(50);

  const normalizedVehicles: CanonicalVehicleOutput[] = rawVehicles.map((raw) =>
    AutoMatchingEngine.normalize(raw, {
      workspaceId,
      feedConfigId,
      dealershipId,
      sourceType,
      fallbackBaseUrl: feedUrl,
    })
  );

  await job.updateProgress(70);

  const stockSyncService = new StockSyncService();
  const syncResult = await stockSyncService.syncStock(workspaceId, feedConfigId, normalizedVehicles, {
    dealershipId,
  });

  await job.updateProgress(100);

  return {
    syncHistoryId: syncResult.syncHistoryId,
    status: syncResult.status,
    totalIngested: syncResult.diff.totalIngested,
    totalCreated: syncResult.diff.totalCreated,
    totalUpdated: syncResult.diff.totalUpdated,
    totalRemoved: syncResult.diff.totalRemoved,
    durationMs: syncResult.durationMs,
  };
}

export function createSyncFeedWorker(concurrency: number = 2): Worker<XmlIngestionJobData, SyncFeedJobResult> {
  const worker = new Worker<XmlIngestionJobData, SyncFeedJobResult>(
    QUEUE_NAMES.XML_INGESTION,
    async (job) => {
      if (job.name !== JOB_NAMES.SYNC_FEED) {
        throw new Error(`Job não suportado neste worker: ${job.name}`);
      }
      return processSyncFeedJob(job);
    },
    {
      connection: createRedisConnection(),
      concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[SyncFeedWorker] Job ${job.id} concluído — feed ${job.data.feedConfigId}: ` +
        `+${result.totalCreated} ~${result.totalUpdated} -${result.totalRemoved} (${result.durationMs}ms)`
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[SyncFeedWorker] Job ${job?.id} falhou — feed ${job?.data.feedConfigId}: ${err.message}`
    );
  });

  return worker;
}
