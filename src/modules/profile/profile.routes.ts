import { FastifyInstance } from 'fastify';
import {
  authenticate,
  requirePermission,
  requireRole,
  requireWorkspace,
} from '../auth/index.js';
import { validate } from '../../middleware/validation.js';
import { workspaceParamsSchema } from '../../schemas/workspaces.js';
import { updateWorkspaceProfileSchema } from '../../schemas/profile.js';
import {
  getWorkspaceProfileHandler,
  patchWorkspaceProfileHandler,
} from './profile.controller.js';

export async function registerProfileRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/v1/workspaces/:workspaceId/profile',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requireRole(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER']),
        validate(workspaceParamsSchema, 'params'),
      ],
    },
    async (req, reply) => getWorkspaceProfileHandler(req as any, reply),
  );

  server.patch(
    '/api/v1/workspaces/:workspaceId/profile',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('WORKSPACE_SETTINGS_EDIT'),
        validate(workspaceParamsSchema, 'params'),
        validate(updateWorkspaceProfileSchema, 'body'),
      ],
    },
    async (req, reply) => patchWorkspaceProfileHandler(req as any, reply),
  );
}
