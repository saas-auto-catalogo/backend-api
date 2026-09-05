import 'dotenv/config';
import { Readable } from 'node:stream';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { Sentry } from './instrument.js';
import { getMetaVehiclesFeedHandler } from './modules/meta-feed/meta-feed.controller.js';
import {
  getMetaAuthUrlHandler,
  postMetaCallbackHandler,
  postMetaSelectCatalogHandler,
  getMetaDiagnosticsHandler
} from './modules/meta-connector/meta-connector.controller.js';
import {
  createStripePixHandler,
  createStripeCardHandler,
  createStripeCheckoutSessionHandler,
  createWorkspaceStripeCheckoutSessionHandler,
  getStripeCheckoutSessionStatusHandler,
  stripeWebhookHandler
} from './modules/checkout/checkout.controller.js';
import {
  createStripePortalSessionHandler,
  getWorkspaceBillingDetailsHandler,
  getWorkspaceBillingInvoicesHandler
} from './modules/billing/billing.controller.js';
import { registerFeedRoutes } from './modules/feeds/feed.routes.js';
import { registerDashboardRoutes } from './modules/dashboard/index.js';
import { registerProfileRoutes } from './modules/profile/index.js';
import {
  authenticate,
  requireRole,
  requireWorkspace,
} from './modules/auth/index.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerLegalRoutes } from './modules/legal/index.js';
import { ensureCurrentLegalDocumentsSynced } from './modules/legal/legal-sync.service.js';
import { errorHandler } from './middleware/errorHandler.js';
import { validate } from './middleware/validation.js';
import { feedParamsSchema } from './schemas/feeds.js';
import { createStripePixSchema, createStripeCardSchema, createStripeCheckoutSessionSchema, createWorkspaceStripeCheckoutSessionSchema, checkoutSessionParamsSchema } from './schemas/billing.js';
import { portalSessionSchema } from './schemas/billing.js';
import { listInvoicesQuerySchema } from './schemas/billing.js';
import { getAuthUrlQuerySchema, postCallbackBodySchema, postSelectCatalogBodySchema, diagnosticsParamsSchema } from './schemas/metaConnector.js';
import { workspaceParamsSchema } from './schemas/workspaces.js';
import { getCorsOrigin } from './config/cors.js';
import { getEnv, validateEnv } from './config/env.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  await server.register(cors, {
    origin: getCorsOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(cookie);

  await server.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'deflate']
  });

  const jwtSecret = getEnv().JWT_SECRET;
  await server.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '15m'
    }
  });

  server.setErrorHandler(errorHandler);

  server.addHook('preParsing', async (request, _reply, payload) => {
    const url = request.url.split('?')[0];
    if (url !== '/api/v1/webhooks/stripe') {
      return payload;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);
    (request as { rawBody?: Buffer }).rawBody = rawBody;
    // Fastify expects a Readable stream from preParsing (Buffer breaks setEncoding).
    return Readable.from(rawBody);
  });

  // --- ROTAS PUBLICAS ---

  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'saas-auto-catalogo-backend-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  server.get('/api/v1/feeds/:token/meta-vehicles.xml', { preHandler: [validate(feedParamsSchema, 'params')] }, async (req, reply) => getMetaVehiclesFeedHandler(req as any, reply));

  server.post('/api/v1/checkout/stripe/pix', { preHandler: [validate(createStripePixSchema, 'body')] }, async (req, reply) => createStripePixHandler(req as any, reply));
  server.post('/api/v1/checkout/stripe/card', { preHandler: [validate(createStripeCardSchema, 'body')] }, async (req, reply) => createStripeCardHandler(req as any, reply));
  server.post('/api/v1/checkout/stripe/session', { preHandler: [validate(createStripeCheckoutSessionSchema, 'body')] }, async (req, reply) => createStripeCheckoutSessionHandler(req as any, reply));
  server.get(
    '/api/v1/checkout/stripe/session/:sessionId/status',
    { preHandler: [validate(checkoutSessionParamsSchema, 'params')] },
    async (req, reply) => getStripeCheckoutSessionStatusHandler(req as any, reply),
  );
  server.post('/api/v1/webhooks/stripe', {
    config: { rawBody: true },
    compress: false,
  }, stripeWebhookHandler);

  // --- ROTAS DE AUTENTICACAO (Issue #12) ---
  await registerAuthRoutes(server);
  await registerLegalRoutes(server);

  // --- ROTAS PRIVADAS AUTENTICADAS (JWT + RBAC + Multi-Tenant) ---

  server.post(
    '/api/v1/billing/portal',
    { preHandler: [authenticate, validate(portalSessionSchema, 'body')] },
    async (req, reply) => createStripePortalSessionHandler(req as any, reply)
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/billing',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER']), validate(workspaceParamsSchema, 'params')] },
    async (req, reply) => getWorkspaceBillingDetailsHandler(req as any, reply)
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/billing/invoices',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requireRole(['SUPER_ADMIN', 'OWNER']),
        validate(workspaceParamsSchema, 'params'),
        validate(listInvoicesQuerySchema, 'query'),
      ],
    },
    async (req, reply) => getWorkspaceBillingInvoicesHandler(req as any, reply)
  );

  server.post(
    '/api/v1/workspaces/:workspaceId/checkout/stripe/session',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requireRole(['SUPER_ADMIN', 'OWNER']),
        validate(workspaceParamsSchema, 'params'),
        validate(createWorkspaceStripeCheckoutSessionSchema, 'body'),
      ],
    },
    async (req, reply) => createWorkspaceStripeCheckoutSessionHandler(req as any, reply)
  );

  server.get(
    '/api/v1/integrations/meta/auth-url',
    { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'OWNER']), validate(getAuthUrlQuerySchema, 'query')] },
    async (req, reply) => getMetaAuthUrlHandler(req as any, reply)
  );

  server.post(
    '/api/v1/integrations/meta/callback',
    { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'OWNER']), validate(postCallbackBodySchema, 'body')] },
    async (req, reply) => postMetaCallbackHandler(req as any, reply)
  );

  server.post(
    '/api/v1/integrations/meta/select-catalog',
    { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'OWNER']), validate(postSelectCatalogBodySchema, 'body')] },
    async (req, reply) => postMetaSelectCatalogHandler(req as any, reply)
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/meta-catalogs/:catalogId/diagnostics',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER'])] },
    async (req, reply) => getMetaDiagnosticsHandler(req as any, reply)
  );

  // Registro das Rotas do Módulo de Feeds (CRUD, Sync Manual via BullMQ e Histórico)
  await registerFeedRoutes(server);

  // Registro das Rotas do Dashboard (stats, vehicles, meta-catalogs, audit-logs)
  await registerDashboardRoutes(server);

  // Registro das Rotas de Perfil (user + workspace/dealership)
  await registerProfileRoutes(server);

  return server;
}

export async function startServer(port: number = 3333, host: string = '0.0.0.0') {
  validateEnv();
  const server = await buildServer();
  Sentry.setupFastifyErrorHandler(server);

  try {
    const address = await server.listen({ port, host });
    console.log(`SaaS Auto Catalogo Backend API rodando em ${address}`);

    // Non-blocking: provision current legal docs if the catalog is empty (e.g. fresh deploy).
    void ensureCurrentLegalDocumentsSynced()
      .then((result) => {
        if (result) {
          server.log.info({ result }, '[LegalSync] Documentos jurídicos sincronizados no startup');
        }
      })
      .catch((err) => {
        server.log.error(err, '[LegalSync] Falha no sync automático no startup');
        Sentry.captureException(err);
      });

    if (process.env.SENTRY_SEND_TEST_EVENT === 'true') {
      Sentry.captureMessage('drivesync-backend sentry smoke test', 'info');
      await Sentry.flush(2000);
    }
    return server;
  } catch (err) {
    Sentry.captureException(err);
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && typeof require !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.PORT || '3333', 10);
  startServer(port);
}
