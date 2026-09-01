import { FastifyInstance } from 'fastify';
import {
  authenticate,
  requirePermission,
  requireWorkspace,
} from '../auth/index.js';
import { validate } from '../../middleware/validation.js';
import {
  auditLogsQuerySchema,
  vehicleIdParamsSchema,
  vehiclesListQuerySchema,
  workspaceParamsSchema,
} from '../../schemas/dashboard.js';
import {
  getDashboardStatsHandler,
  getVehicleByIdHandler,
  listAuditLogsHandler,
  listDashboardIssuesHandler,
  listMetaCatalogsHandler,
  listVehiclesHandler,
} from './dashboard.controller.js';

export async function registerDashboardRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/v1/workspaces/:workspaceId/dashboard/stats',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('DASHBOARD_STATS_VIEW'),
        validate(workspaceParamsSchema, 'params'),
      ],
    },
    async (req, reply) => getDashboardStatsHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/dashboard/issues',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('DASHBOARD_STATS_VIEW'),
        validate(workspaceParamsSchema, 'params'),
      ],
    },
    async (req, reply) => listDashboardIssuesHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/vehicles',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('VEHICLES_VIEW'),
        validate(workspaceParamsSchema, 'params'),
        validate(vehiclesListQuerySchema, 'query'),
      ],
    },
    async (req, reply) => listVehiclesHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/vehicles/:vehicleId',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('VEHICLES_VIEW'),
        validate(vehicleIdParamsSchema, 'params'),
      ],
    },
    async (req, reply) => getVehicleByIdHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/meta-catalogs',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('META_CATALOGS_VIEW'),
        validate(workspaceParamsSchema, 'params'),
      ],
    },
    async (req, reply) => listMetaCatalogsHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/audit-logs',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('AUDIT_LOGS_VIEW'),
        validate(workspaceParamsSchema, 'params'),
        validate(auditLogsQuerySchema, 'query'),
      ],
    },
    async (req, reply) => listAuditLogsHandler(req as any, reply),
  );
}
