import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { getMetaVehiclesFeedHandler } from './modules/meta-feed/meta-feed.controller.js';
import {
  getMetaAuthUrlHandler,
  postMetaCallbackHandler,
  getMetaDiagnosticsHandler
} from './modules/meta-connector/meta-connector.controller.js';
import {
  createStripePixHandler,
  createStripeCardHandler,
  createStripeCheckoutSessionHandler,
  stripeWebhookHandler
} from './modules/checkout/checkout.controller.js';
import {
  createStripePortalSessionHandler,
  getWorkspaceBillingDetailsHandler
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
import { errorHandler } from './middleware/errorHandler.js';
import { validate } from './middleware/validation.js';
import { feedParamsSchema } from './schemas/feeds.js';
import { createStripePixSchema, createStripeCardSchema, createStripeCheckoutSessionSchema } from './schemas/billing.js';
import { portalSessionSchema } from './schemas/billing.js';
import { getAuthUrlQuerySchema, postCallbackBodySchema, diagnosticsParamsSchema } from './schemas/metaConnector.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(cookie);

  await server.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'deflate']
  });

  const jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-signing-key-for-auth-minimum-32-chars';
  await server.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '15m'
    }
  });

  server.setErrorHandler(errorHandler);

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
  server.post('/api/v1/webhooks/stripe', stripeWebhookHandler);

  // --- ROTAS DE AUTENTICACAO (Issue #12) ---
  await registerAuthRoutes(server);

  // --- ROTAS PRIVADAS AUTENTICADAS (JWT + RBAC + Multi-Tenant) ---

  server.post(
    '/api/v1/billing/portal',
    { preHandler: [authenticate, validate(portalSessionSchema, 'body')] },
    async (req, reply) => createStripePortalSessionHandler(req as any, reply)
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/billing',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER']), validate(diagnosticsParamsSchema, 'params')] },
    async (req, reply) => getWorkspaceBillingDetailsHandler(req as any, reply)
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
  const server = await buildServer();

  try {
    const address = await server.listen({ port, host });
    console.log(`SaaS Auto Catalogo Backend API rodando em ${address}`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' && typeof require !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.PORT || '3333', 10);
  startServer(port);
}
