import { FastifyRequest, FastifyReply } from 'fastify';
import { MetaOAuthService } from './meta-oauth.service.js';
import { MetaGraphApiClient } from './meta-graph.client.js';
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
  const businesses = await graphClient.getBusinesses(longToken.accessToken).catch(() => []);
  const primaryBusiness = businesses[0];

  let catalogs: any[] = [];
  if (primaryBusiness) {
    catalogs = await graphClient.getOwnedCatalogs(primaryBusiness.id, longToken.accessToken).catch(() => []);
  }

  // 4. Cria ou vincula o MetaCatalog no banco de dados
  const existingMetaCatalog = await prisma.metaCatalog.findFirst({
    where: { workspaceId }
  });

  if (existingMetaCatalog) {
    await prisma.metaCatalog.update({
      where: { id: existingMetaCatalog.id },
      data: {
        metaCatalogId: catalogs[0]?.id || existingMetaCatalog.metaCatalogId,
        catalogName: catalogName || catalogs[0]?.name || existingMetaCatalog.catalogName,
        updatedAt: new Date()
      }
    });
  }

  return reply.status(200).send({
    success: true,
    workspaceId,
    tokenType: longToken.tokenType,
    expiresInSeconds: longToken.expiresInSeconds,
    businessAccountsCount: businesses.length,
    catalogsFound: catalogs.length,
    catalogs
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
