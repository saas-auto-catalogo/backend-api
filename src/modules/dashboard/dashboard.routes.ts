import { FastifyInstance } from 'fastify';
import {
  authenticate,
  requirePermission,
  requireWorkspace,
} from '../auth/index.js';
import { validate } from '../../middleware/validation.js';
import {
  activityQuerySchema,
  auditLogsQuerySchema,
  vehicleIdParamsSchema,
  vehiclesListQuerySchema,
  workspaceParamsSchema,
} from '../../schemas/dashboard.js';
import {
  getDashboardStatsHandler,
  getVehicleByIdHandler,
  listAuditLogsHandler,
  listDashboardActivityHandler,
  listDashboardIssuesHandler,
  listMetaCatalogsHandler,
  listVehiclesHandler,
  listVehicleMakesHandler,
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
    (req, reply) => getDashboardStatsHandler(req as any, reply),
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
    (req, reply) => listDashboardIssuesHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/dashboard/activity',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('DASHBOARD_STATS_VIEW'),
        validate(workspaceParamsSchema, 'params'),
        validate(activityQuerySchema, 'query'),
      ],
    },
    (req, reply) => listDashboardActivityHandler(req as any, reply),
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
    (req, reply) => listVehiclesHandler(req as any, reply),
  );

  server.get(
    '/api/v1/workspaces/:workspaceId/vehicles/makes',
    {
      preHandler: [
        authenticate,
        requireWorkspace,
        requirePermission('VEHICLES_VIEW'),
        validate(workspaceParamsSchema, 'params'),
      ],
    },
    (req, reply) => listVehicleMakesHandler(req as any, reply),
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
    (req, reply) => getVehicleByIdHandler(req as any, reply),
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
    (req, reply) => listMetaCatalogsHandler(req as any, reply),
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
    (req, reply) => listAuditLogsHandler(req as any, reply),
  );
}
