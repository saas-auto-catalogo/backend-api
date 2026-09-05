import { Job, Worker } from 'bullmq';
import { Readable } from 'stream';
import { SyncStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { createRedisConnection } from '../../redis/redis-client.js';
import { JOB_NAMES, QUEUE_NAMES, XmlIngestionJobData } from '../queue-types.js';
import { downloadFeedStream } from '../../../modules/xml-ingestion/feed-downloader.js';
import { ingestFeedStream } from '../../../modules/feeds/feed-format.parser.js';
import { AutoMatchingEngine, CanonicalVehicleOutput, extractOrigin } from '../../../modules/normalization/auto-matching.engine.js';
import { StockSyncService } from '../../../modules/stock-diff/stock-sync.service.js';

export const INGEST_PROGRESS_CEILING = 45;

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

async function ingestFeedStreamWithProgress(
  stream: Readable,
  contentType: string,
  out: Record<string, unknown>[],
  job: Job<XmlIngestionJobData>
): Promise<void> {
  const { format, rawVehicles } = await ingestFeedStream(stream, contentType);

  for (const vehicle of rawVehicles) {
    out.push(vehicle);
    if (out.length % 50 === 0) {
      await job.updateProgress(Math.min(10 + Math.floor(out.length / 10), INGEST_PROGRESS_CEILING));
    }
  }

  if (format === 'unknown') {
    throw new Error('Formato não suportado — esperado XML ou JSON no formato { vehicles: [...] }');
  }
}

/**
 * Resolve o origin base para montagem de URLs canônicas.
 * Prioriza o site oficial da concessionária (dealership.websiteUrl) e,
 * na ausência, extrai apenas o origin (protocolo+host) do feedUrl,
 * descartando caminhos como /api/vehicles.
 */
async function resolveFallbackBaseUrl(
  feedUrl: string,
  dealershipId?: string
): Promise<string> {
  if (dealershipId) {
    try {
      const dealership = await prisma.dealership.findUnique({
        where: { id: dealershipId },
        select: { websiteUrl: true },
      });
      const websiteOrigin = extractOrigin(dealership?.websiteUrl);
      if (websiteOrigin) {
        return websiteOrigin;
      }
    } catch {
      // Segue para o fallback do feedUrl em caso de falha na consulta.
    }
  }
  return extractOrigin(feedUrl) || feedUrl;
}

async function processSyncFeedJob(job: Job<XmlIngestionJobData>): Promise<SyncFeedJobResult> {
  const data = job.data;
  validateJobData(data);

  const { workspaceId, feedConfigId, feedUrl, sourceType, dealershipId } = data;

  await job.updateProgress(5);

  const downloadResult = await downloadFeedStream(feedUrl);
  await job.updateProgress(10);

  const rawVehicles: Record<string, unknown>[] = [];

  await ingestFeedStreamWithProgress(downloadResult.stream, downloadResult.contentType, rawVehicles, job);

  await job.updateProgress(50);

  const fallbackBaseUrl = await resolveFallbackBaseUrl(feedUrl, dealershipId);

  const normalizedVehicles: CanonicalVehicleOutput[] = rawVehicles.map((raw) =>
    AutoMatchingEngine.normalize(raw, {
      workspaceId,
      feedConfigId,
      dealershipId,
      sourceType,
      fallbackBaseUrl,
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
    const feedConfigId = job?.data?.feedConfigId;
    const message = err.message || String(err);
    const shortMessage = message.length > 255 ? `${message.slice(0, 252)}...` : message;

    console.error(
      `[SyncFeedWorker] Job ${job?.id} falhou — feed ${feedConfigId}: ${message}`
    );

    if (feedConfigId) {
      prisma.feedConfig
        .update({
          where: { id: feedConfigId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: SyncStatus.FAILED,
            lastSyncMessage: `Erro na sincronização: ${shortMessage}`,
          },
        })
        .catch((updateErr) => {
          console.error(
            `[SyncFeedWorker] Não foi possível marcar feed ${feedConfigId} como FAILED: ${(updateErr as Error).message}`
          );
        });
    }
  });

  return worker;
}
