import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { feedCacheService } from '../../infra/cache/feed-cache.service.js';
import { MetaXmlFeedGenerator } from './meta-feed-generator.js';
import { VehicleStatus, SyncStatus } from '@prisma/client';

interface FeedParams {
  token: string;
}

interface FeedQuery {
  refresh?: string;
}

export async function getMetaVehiclesFeedHandler(
  request: FastifyRequest<{ Params: FeedParams; Querystring: FeedQuery }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  const { token } = request.params;

  if (!token || token.trim().length < 8) {
    return reply.status(400).send({
      error: 'Token de catálogo inválido ou não fornecido.'
    });
  }

  const clientEtag = request.headers['if-none-match'];

  // 1. Consulta no Cache Distribuído Redis
  const cacheEntry = await feedCacheService.getFeedXml(token);

  // Auto-invalidação de cache legado: se o XML armazenado em cache for de versões anteriores
  // (sem a estrutura oficial Meta Automotive <listings><listing>) ou se for requisitado refresh explícito via ?refresh=true,
  // ignoramos o cache antigo e forçamos a regeneração imediata.
  const isLegacyFeed = Boolean(
    cacheEntry &&
    (!cacheEntry.xml.includes('<listings>') || !cacheEntry.xml.includes('<listing>'))
  );
  const forceRefresh = Boolean(request.query?.refresh);

  if (cacheEntry && !isLegacyFeed && !forceRefresh) {
    // Resposta condicional 304 Not Modified
    if (clientEtag && clientEtag === cacheEntry.etag) {
      return reply
        .status(304)
        .header('ETag', cacheEntry.etag)
        .header('Cache-Control', 'public, max-age=900, stale-while-revalidate=300')
        .header('X-Feed-Cache', 'HIT')
        .send();
    }

    const durationMs = Date.now() - startTime;
    return reply
      .status(200)
      .header('Content-Type', 'application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=900, stale-while-revalidate=300')
      .header('ETag', cacheEntry.etag)
      .header('X-Feed-Cache', 'HIT')
      .header('X-Response-Time', `${durationMs}ms`)
      .send(cacheEntry.xml);
  }

  // 2. Cache MISS: Consulta no PostgreSQL (FeedConfig ou MetaCatalog)
  const feedConfig = await prisma.feedConfig.findFirst({
    where: {
      OR: [
        { activeTokenHash: token },
        { previousTokenHash: token }
      ],
      isActive: true
    },
    include: {
      workspace: true,
      dealership: true
    }
  });

  if (!feedConfig) {
    return reply.status(404).send({
      error: 'Catálogo do Meta Ads não encontrado ou token inválido.'
    });
  }

  // 3. Busca os veículos elegíveis do estoque
  const vehicles = await prisma.vehicle.findMany({
    where: {
      workspaceId: feedConfig.workspaceId,
      status: VehicleStatus.AVAILABLE,
      eligibleForMetaAds: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  const proto = (request.headers['x-forwarded-proto'] as string) || (request.hostname.includes('localhost') || request.hostname.includes('127.0.0.1') ? 'http' : 'https');
  const fullFeedUrl = `${proto}://${request.hostname}/api/v1/feeds/${token}/meta-vehicles.xml`;
  const catalogName = `${feedConfig.workspace.name} - Catálogo Meta Automotive Ads`;

  // 4. Gera o XML RSS 2.0 Meta DAA
  const result = MetaXmlFeedGenerator.generateFeed(vehicles as any, {
    feedUrl: fullFeedUrl,
    catalogName,
    workspace: feedConfig.workspace,
    dealership: feedConfig.dealership || undefined
  });

  // 5. Armazena no Redis com TTL de 15 minutos (900s)
  await feedCacheService.setFeedXml(token, result.xml, feedConfig.workspaceId, 900);

  // 6. Atualiza registro de exportação no MetaCatalog se existir
  await prisma.metaCatalog.updateMany({
    where: { workspaceId: feedConfig.workspaceId },
    data: {
      lastExportAt: new Date(),
      lastExportStatus: SyncStatus.SUCCESS,
      eligibleVehiclesCount: result.itemCount
    }
  }).catch(() => {});

  const durationMs = Date.now() - startTime;

  if (clientEtag && clientEtag === result.etag) {
    return reply
      .status(304)
      .header('ETag', result.etag)
      .header('Cache-Control', 'public, max-age=900, stale-while-revalidate=300')
      .header('X-Feed-Cache', 'MISS')
      .send();
  }

  return reply
    .status(200)
    .header('Content-Type', 'application/xml; charset=utf-8')
    .header('Cache-Control', 'public, max-age=900, stale-while-revalidate=300')
    .header('ETag', result.etag)
    .header('X-Feed-Cache', 'MISS')
    .header('X-Feed-Items', String(result.itemCount))
    .header('X-Response-Time', `${durationMs}ms`)
    .send(result.xml);
}
