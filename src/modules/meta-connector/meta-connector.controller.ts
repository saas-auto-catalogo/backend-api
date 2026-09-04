import { FastifyRequest, FastifyReply } from 'fastify';
import { MetaOAuthService } from './meta-oauth.service.js';
import { MetaGraphApiClient, MetaCatalogItem, MetaBusinessAccount } from './meta-graph.client.js';
import { metaConnectorService, DealershipNotFoundError } from './meta-connector.service.js';
import { prisma } from '../../lib/prisma.js';

const oauthService = new MetaOAuthService();
const graphClient = new MetaGraphApiClient();

export async function getMetaAuthUrlHandler(
  request: FastifyRequest<{ Querystring: { workspaceId: string; redirectUri: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, redirectUri } = request.query;

  if (!workspaceId || !redirectUri) {
    return reply.status(400).send({
      error: 'Parâmetros workspaceId e redirectUri são obrigatórios.'
    });
  }

  const { url, state } = oauthService.generateAuthorizationUrl(workspaceId, redirectUri);

  return reply.send({
    authUrl: url,
    state
  });
}

export async function postMetaCallbackHandler(
  request: FastifyRequest<{
    Body: { code: string; state: string; redirectUri: string; catalogName?: string }
  }>,
  reply: FastifyReply
) {
  const { code, state, redirectUri, catalogName } = request.body;

  if (!code || !state || !redirectUri) {
    return reply.status(400).send({
      error: 'Parâmetros code, state e redirectUri são obrigatórios.'
    });
  }

  // 1. Validação de CSRF
  const { isValid, workspaceId } = oauthService.verifyState(state);
  if (!isValid || !workspaceId) {
    return reply.status(403).send({
      error: 'State inválido ou expirado (falha de proteção CSRF).'
    });
  }

  // 2. Troca de código por token de curta e longa duração (60 dias)
  const shortToken = await oauthService.exchangeCodeForToken(code, redirectUri);
  const longToken = await oauthService.exchangeForLongLivedToken(shortToken.accessToken);

  // 3. Consulta de contas de Business Manager e Catálogos
  const businesses: MetaBusinessAccount[] = await graphClient
    .getBusinesses(longToken.accessToken)
    .catch(() => []);

  const catalogs: MetaCatalogItem[] = [];
  const seenCatalogIds = new Set<string>();

  for (const business of businesses) {
    const owned = await graphClient
      .getOwnedCatalogs(business.id, longToken.accessToken)
      .catch(() => []);
    for (const catalog of owned) {
      if (seenCatalogIds.has(catalog.id)) continue;
      seenCatalogIds.add(catalog.id);
      catalogs.push({ ...catalog, businessId: business.id, businessName: business.name });
    }
  }

  // 3.1 Fallback: usuário sem Business Manager — consulta catálogos no nível de usuário
  if (catalogs.length === 0) {
    const userCatalogs = await graphClient.getUserCatalogs(longToken.accessToken).catch(() => []);
    for (const catalog of userCatalogs) {
      if (seenCatalogIds.has(catalog.id)) continue;
      seenCatalogIds.add(catalog.id);
      catalogs.push(catalog);
    }
  }

  // 3.2 Nome sugerido a partir da concessionária do workspace
  const dealership = await prisma.dealership.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: 'asc' },
  });
  const suggestedCatalogName =
    catalogName || dealership?.tradeName || 'Catálogo Meta Automotive Ads';

  const metaSessionToken = oauthService.generateMetaSessionToken(workspaceId, longToken.accessToken);

  return reply.status(200).send({
    success: true,
    workspaceId,
    businesses,
    catalogs,
    suggestedCatalogName,
    metaSessionToken,
  });
}

export interface PostMetaSelectCatalogBody {
  workspaceId: string;
  metaSessionToken: string;
  catalogId?: string;
  catalogName?: string;
  createNew?: boolean;
  businessId?: string;
}

export async function postMetaSelectCatalogHandler(
  request: FastifyRequest<{ Body: PostMetaSelectCatalogBody }>,
  reply: FastifyReply
) {
  const { workspaceId, metaSessionToken, catalogId, catalogName, createNew, businessId } = request.body;

  const session = oauthService.verifyMetaSessionToken(metaSessionToken);
  if (!session.isValid || !session.workspaceId || !session.accessToken) {
    return reply.status(401).send({
      error: 'Sessão Meta expirada ou inválida. Reconecte sua conta para continuar.',
    });
  }

  if (session.workspaceId !== workspaceId) {
    return reply.status(403).send({
      error: 'O workspace não confere com a sessão Meta autenticada.',
    });
  }

  let resolvedCatalogId: string;
  let resolvedCatalogName: string;
  let created = Boolean(createNew);

  if (createNew) {
    if (!businessId || !catalogName) {
      return reply.status(400).send({
        error: 'businessId e catalogName são obrigatórios para criar um novo catálogo.',
      });
    }

    const trimmedName = catalogName.trim();
    try {
      const createdCatalog = await graphClient.createVehicleCatalog(
        businessId,
        trimmedName,
        session.accessToken,
      );
      resolvedCatalogId = createdCatalog.id;
      resolvedCatalogName = trimmedName;
    } catch (err) {
      const metaMessage = err instanceof Error ? err.message : 'Falha ao criar catálogo na Meta.';
      return reply.status(422).send({
        type: 'https://autocatalogo.com.br/errors/meta-graph',
        title: 'Erro ao criar catálogo na Meta',
        status: 422,
        detail: metaMessage,
        metaError: metaMessage,
        hint: 'A criação programática exige função de Administrador no Gerenciador de Negócios. Crie manualmente no Meta Commerce Manager se preferir.',
      });
    }
  } else {
    if (!catalogId) {
      return reply.status(400).send({
        error: 'catalogId é obrigatório para vincular um catálogo existente.',
      });
    }
    resolvedCatalogId = catalogId;
    resolvedCatalogName = catalogName?.trim() || '';
  }

  try {
    await metaConnectorService.upsertMetaCatalogFromOAuth({
      workspaceId,
      catalogName: resolvedCatalogName || undefined,
      catalogs: [{ id: resolvedCatalogId, name: resolvedCatalogName }],
    });
  } catch (err) {
    if (err instanceof DealershipNotFoundError) {
      return reply.status(404).send({
        type: 'https://autocatalogo.com.br/errors/not-found',
        title: 'Concessionaria Nao Encontrada',
        status: 404,
        detail: err.message,
      });
    }
    throw err;
  }

  await prisma.dealership.updateMany({
    where: { workspaceId },
    data: {
      metaCatalogId: resolvedCatalogId,
      ...(businessId ? { metaBusinessId: businessId } : {}),
    },
  });

  // Atualiza as contagens reais e a data de exportação do MetaCatalog imediatamente
  const [totalVehiclesCount, eligibleVehiclesCount, feedConfig] = await Promise.all([
    prisma.vehicle.count({ where: { workspaceId } }),
    prisma.vehicle.count({ where: { workspaceId, eligibleForMetaAds: true } }),
    prisma.feedConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const resolvedFeedUrl = feedConfig?.activeTokenHash
    ? `${process.env.API_PUBLIC_URL || `${request.protocol}://${request.hostname}`}/api/v1/feeds/${feedConfig.activeTokenHash}/meta-vehicles.xml`
    : null;

  await prisma.metaCatalog.updateMany({
    where: { workspaceId },
    data: {
      totalVehiclesCount,
      eligibleVehiclesCount,
      lastExportAt: new Date(),
      lastExportStatus: 'SUCCESS',
      ...(resolvedFeedUrl ? { publicFeedUrl: resolvedFeedUrl } : {}),
    },
  });

  // Tenta registrar a Fonte de Dados (Product Feed) programaticamente no catálogo da Meta
  if (resolvedFeedUrl && session.accessToken) {
    try {
      await graphClient.createProductFeed(
        resolvedCatalogId,
        `Feed Auto Catálogo - ${resolvedCatalogName || 'Veículos'}`,
        resolvedFeedUrl,
        session.accessToken,
      );
      request.log.info({ catalogId: resolvedCatalogId, feedUrl: resolvedFeedUrl }, 'Fonte de dados (Product Feed) cadastrada na Meta com sucesso');
    } catch (feedErr: any) {
      request.log.warn(
        { message: feedErr?.message, feedUrl: resolvedFeedUrl },
        'Aviso: cadastro automático da Fonte de Dados na Meta recusado (esperado em ambiente localhost/URL não pública)',
      );
    }
  }

  return reply.status(200).send({
    success: true,
    workspaceId,
    catalogId: resolvedCatalogId,
    catalogName: resolvedCatalogName,
    created,
    businessId: businessId ?? null,
  });
}

export async function getMetaDiagnosticsHandler(
  request: FastifyRequest<{
    Params: { workspaceId: string; catalogId: string };
    Headers: { authorization?: string };
  }>,
  reply: FastifyReply
) {
  const { workspaceId, catalogId } = request.params;
  const authHeader = request.headers.authorization;
  const token = authHeader ? authHeader.replace(/^Bearer /i, '') : process.env.META_SYSTEM_USER_TOKEN || 'mock-token';

  const diagnostics = await graphClient.getCatalogDiagnostics(catalogId, token);

  return reply.send({
    workspaceId,
    catalogId,
    report: diagnostics
  });
}
