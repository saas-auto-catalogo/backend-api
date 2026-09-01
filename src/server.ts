import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
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
  stripeWebhookHandler
} from './modules/checkout/checkout.controller.js';
import {
  createStripePortalSessionHandler,
  getWorkspaceBillingDetailsHandler
} from './modules/billing/billing.controller.js';
import {
  authenticate,
  requireRole,
  requireWorkspace,
} from './modules/auth/index.js';
import { errorHandler } from './middleware/errorHandler.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: process.env.NODE_ENV !== 'test'
  });

  // Plugins de Performance e Segurança
  await server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });

  await server.register(compress, {
    global: true,
    threshold: 1024, // Comprime payloads maiores que 1KB
    encodings: ['gzip', 'deflate']
  });

  // Registro do Plugin JWT
  const jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-signing-key-for-auth-minimum-32-chars';
  await server.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '15m'
    }
  });

  // Global error handler to map exceptions to RFC 7807 Problem Details
  server.setErrorHandler(errorHandler);

  // ─── ROTAS PÚBLICAS ────────────────────────────────────────────────────────

  // Rota de Health Check
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'saas-auto-catalogo-backend-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  // Rota Pública de Feed XML Meta Automotive Inventory Ads (DAA) - Autenticada via HMAC
  server.get('/api/v1/feeds/:token/meta-vehicles.xml', getMetaVehiclesFeedHandler);

  // Rotas de Checkout Stripe Transparente (Pix e Cartão) e Webhooks
  server.post('/api/v1/checkout/stripe/pix', createStripePixHandler);
  server.post('/api/v1/checkout/stripe/card', createStripeCardHandler);
  server.post('/api/v1/webhooks/stripe', stripeWebhookHandler);

  // ─── ROTAS PRIVADAS AUTENTICADAS (JWT + RBAC + Multi-Tenant) ───────────────

  // Rota de Perfil do Usuário Autenticado
  server.get(
    '/api/v1/auth/me',
    { preHandler: [authenticate] },
    async (request) => {
      return {
        user: request.user
      };
    }
  );

  // Rota do Stripe Customer Portal (Gerenciar Cartão, Faturas e Cancelamento)
  server.post(
    '/api/v1/billing/portal',
    { preHandler: [authenticate] },
    async (req, reply) => createStripePortalSessionHandler(req as any, reply)
  );

  // Rota de Detalhes de Faturamento do Workspace
  server.get(
    '/api/v1/workspaces/:workspaceId/billing',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER'])] },
    async (req, reply) => getWorkspaceBillingDetailsHandler(req as any, reply)
  );

  // Rotas de Integração OAuth Meta Graph API (Exigem OWNER ou SUPER_ADMIN)
  server.get(
    '/api/v1/integrations/meta/auth-url',
    { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'OWNER'])] },
    async (req, reply) => getMetaAuthUrlHandler(req as any, reply)
  );

  server.post(
    '/api/v1/integrations/meta/callback',
    { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'OWNER'])] },
    async (req, reply) => postMetaCallbackHandler(req as any, reply)
  );

  // Rota de Diagnósticos Meta Graph API (Exige acesso ao workspace e role MANAGER+)
  server.get(
    '/api/v1/workspaces/:workspaceId/meta-catalogs/:catalogId/diagnostics',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER'])] },
    async (req, reply) => getMetaDiagnosticsHandler(req as any, reply)
  );

  return server;
}

export async function startServer(port: number = 3333, host: string = '0.0.0.0') {
  const server = await buildServer();

  try {
    const address = await server.listen({ port, host });
    console.log(`🚀 SaaS Auto Catálogo Backend API rodando em ${address}`);
    return server;
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Inicialização se executado como script principal
if (process.env.NODE_ENV !== 'test' && typeof require !== 'undefined' && require.main === module) {
  const port = parseInt(process.env.PORT || '3333', 10);
  startServer(port);
}
