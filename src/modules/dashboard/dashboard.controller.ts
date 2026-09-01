import { FastifyReply, FastifyRequest } from 'fastify';
import { dashboardService } from './dashboard.service.js';
import type { AuditLogsQuery, VehiclesListQuery } from '../../schemas/dashboard.js';

export async function getDashboardStatsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const stats = await dashboardService.getStats(workspaceId);
  reply.status(200).send(stats);
}

export async function listVehiclesHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: VehiclesListQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const result = await dashboardService.listVehicles(workspaceId, request.query);
  reply.status(200).send(result);
}

export async function getVehicleByIdHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; vehicleId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId, vehicleId } = request.params;
  const vehicle = await dashboardService.getVehicleById(workspaceId, vehicleId);

  if (!vehicle) {
    reply.status(404).send({
      type: 'https://autocatalogo.com.br/errors/not-found',
      title: 'Veiculo Nao Encontrado',
      status: 404,
      detail: `O veiculo com identificador "${vehicleId}" nao foi encontrado neste workspace.`,
      instance: request.url,
    });
    return;
  }

  reply.status(200).send(vehicle);
}

export async function listMetaCatalogsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const catalogs = await dashboardService.listMetaCatalogs(workspaceId);
  reply.status(200).send({ catalogs });
}

export async function listAuditLogsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: AuditLogsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const result = await dashboardService.listAuditLogs(workspaceId, request.query);
  reply.status(200).send(result);
}

export async function listDashboardIssuesHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const items = await dashboardService.listDashboardIssues(workspaceId);
  reply.status(200).send({ items });
}
