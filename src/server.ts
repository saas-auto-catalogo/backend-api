import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import { getMetaVehiclesFeedHandler } from './modules/meta-feed/meta-feed.controller.js';
import {
  getMetaAuthUrlHandler,
  postMetaCallbackHandler,
  getMetaDiagnosticsHandler
} from './modules/meta-connector/meta-connector.controller.js';

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

  // Rota de Health Check
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'saas-auto-catalogo-backend-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  });

  // Rota Pública de Feed XML Meta Automotive Inventory Ads (DAA)
  server.get('/api/v1/feeds/:token/meta-vehicles.xml', getMetaVehiclesFeedHandler);

  // Rotas de Integração OAuth & Diagnósticos Meta Graph API
  server.get('/api/v1/integrations/meta/auth-url', getMetaAuthUrlHandler);
  server.post('/api/v1/integrations/meta/callback', postMetaCallbackHandler);
  server.get('/api/v1/workspaces/:workspaceId/meta-catalogs/:catalogId/diagnostics', getMetaDiagnosticsHandler);

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
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const port = parseInt(process.env.PORT || '3333', 10);
  startServer(port);
}
