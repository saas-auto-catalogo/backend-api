import { FastifyInstance } from 'fastify';
import {
  listFeedsHandler,
  getFeedByIdHandler,
  createFeedHandler,
  updateFeedHandler,
  deleteFeedHandler,
  triggerFeedSyncHandler,
  getFeedSyncJobStatusHandler,
  getFeedHistoryHandler,
  validateFeedUrlHandler,
} from './feed.controller.js';
import {
  authenticate,
  requireRole,
  requireWorkspace,
  requirePermission,
} from '../auth/index.js';
import { validate } from '../../middleware/validation.js';
import { validateFeedUrlBodySchema } from '../../schemas/feeds.js';
import { workspaceParamsSchema } from '../../schemas/workspaces.js';
import { workspaceRateLimit } from '../../infra/security/workspace-rate-limit.middleware.js';

export async function registerFeedRoutes(server: FastifyInstance) {
  // Listar feeds do workspace (VIEWER+)
  server.get(
    '/api/v1/workspaces/:workspaceId/feeds',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'])] },
    async (req, reply) => listFeedsHandler(req as any, reply)
  );

  // Criar novo feed no workspace (MANAGER+)
  server.post(
    '/api/v1/workspaces/:workspaceId/feeds',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER'])] },
    async (req, reply) => createFeedHandler(req as any, reply)
  );

  // Validar URL de feed sem persistir (MANAGER+)
  server.post(
    '/api/v1/workspaces/:workspaceId/feeds/validate-url',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        workspaceRateLimit('feeds:validate-url', { windowSeconds: 60, maxRequests: 20 }),
        requirePermission('FEEDS_CREATE'),
        validate(workspaceParamsSchema, 'params'),
        validate(validateFeedUrlBodySchema, 'body'),
      ],
    },
    async (req, reply) => validateFeedUrlHandler(req as any, reply)
  );

  // Detalhes de um feed (VIEWER+)
  server.get(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'])] },
    async (req, reply) => getFeedByIdHandler(req as any, reply)
  );

  // Atualizar feed (MANAGER+)
  server.put(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER'])] },
    async (req, reply) => updateFeedHandler(req as any, reply)
  );

  // Deletar feed (OWNER+)
  server.delete(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER'])] },
    async (req, reply) => deleteFeedHandler(req as any, reply)
  );

  // Disparar sincronização manual (OWNER+)
  server.post(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId/sync',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER'])] },
    async (req, reply) => triggerFeedSyncHandler(req as any, reply)
  );

  // Consultar status de job de sincronização (VIEWER+)
  server.get(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId/sync/:jobId',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'])] },
    async (req, reply) => getFeedSyncJobStatusHandler(req as any, reply)
  );

  // Histórico de sincronizações do feed (VIEWER+)
  server.get(
    '/api/v1/workspaces/:workspaceId/feeds/:feedId/history',
    { preHandler: [authenticate, requireWorkspace, requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'])] },
    async (req, reply) => getFeedHistoryHandler(req as any, reply)
  );
}
