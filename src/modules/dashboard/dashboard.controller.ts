import { FastifyReply, FastifyRequest } from 'fastify';
import { dashboardService } from './dashboard.service.js';
import type { ActivityQuery, AuditLogsQuery, VehiclesListQuery } from '../../schemas/dashboard.js';

export async function getDashboardStatsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const stats = await dashboardService.getStats(workspaceId);
  return reply.status(200).send(stats);
}

export async function listVehiclesHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: VehiclesListQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const result = await dashboardService.listVehicles(workspaceId, request.query);
  return reply.status(200).send(result);
}

export async function listVehicleMakesHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const makes = await dashboardService.listVehicleMakes(workspaceId);
  return reply.status(200).send({ makes });
}

export async function getVehicleByIdHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; vehicleId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId, vehicleId } = request.params;
  const vehicle = await dashboardService.getVehicleById(workspaceId, vehicleId);

  if (!vehicle) {
    return reply.status(404).send({
      type: 'https://autocatalogo.com.br/errors/not-found',
      title: 'Veiculo Nao Encontrado',
      status: 404,
      detail: `O veiculo com identificador "${vehicleId}" nao foi encontrado neste workspace.`,
      instance: request.url,
    });
  }

  return reply.status(200).send(vehicle);
}

export async function listMetaCatalogsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const host = request.headers.host || request.hostname;
  const baseUrl = `${request.protocol}://${host}`;
  const catalogs = await dashboardService.listMetaCatalogs(workspaceId, baseUrl);
  return reply.status(200).send({ catalogs });
}

export async function listAuditLogsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: AuditLogsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const result = await dashboardService.listAuditLogs(workspaceId, request.query);
  return reply.status(200).send(result);
}

export async function listDashboardIssuesHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const items = await dashboardService.listDashboardIssues(workspaceId);
  return reply.status(200).send({ items });
}

export async function listDashboardActivityHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: ActivityQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const events = await dashboardService.listDashboardActivity(workspaceId, request.query);
  return reply.status(200).send({ events });
}
