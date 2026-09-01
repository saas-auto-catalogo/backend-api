import { Prisma, SyncStatus, Vehicle, VehicleStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AuditLogsQuery, VehiclesListQuery } from '../../schemas/dashboard.js';

export interface DashboardStats {
  totalVehicles: number;
  availableVehicles: number;
  eligibleForMetaAds: number;
  pendingIssuesCount: number;
  blockingIssuesCount: number;
  newVehiclesThisMonth: number;
  healthScore: number;
  catalogStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  lastDmsSync: {
    at: string | null;
    durationMs: number | null;
    sourceName: string | null;
    status: SyncStatus | null;
  };
  lastMetaExport: {
    at: string | null;
    status: SyncStatus | null;
    catalogName: string | null;
  };
}

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  version: string;
  price: number;
  promotionalPrice?: number;
  manufactureYear: number;
  modelYear: number;
  mileage: number;
  fuelType: string;
  transmission: string;
  licensePlate: string;
  vin: string;
  color?: string;
  doors?: number;
  imageUrl: string;
  status: VehicleStatus;
  armored?: boolean;
  hasWarranty?: boolean;
  eligibleForMetaAds: boolean;
  validationWarnings?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaCatalogSummary {
  id: string;
  catalogName: string;
  metaCatalogId: string | null;
  feedFormat: string;
  publicFeedUrl: string | null;
  totalVehiclesCount: number;
  eligibleVehiclesCount: number;
  lastExportAt: string | null;
  lastExportStatus: SyncStatus | null;
  healthScore: number;
  dealershipId: string | null;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  entityName: string;
  entityId: string | null;
  actorEmail: string;
  actorUserId: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

function buildPagination(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

function mapVehicleToDTO(vehicle: Vehicle): VehicleDTO {
  const warnings = Array.isArray(vehicle.validationWarnings)
    ? (vehicle.validationWarnings as string[])
    : vehicle.validationWarnings
      ? [String(vehicle.validationWarnings)]
      : undefined;

  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    version: vehicle.version,
    price: Number(vehicle.price),
    promotionalPrice: vehicle.promotionalPrice ? Number(vehicle.promotionalPrice) : undefined,
    manufactureYear: vehicle.manufactureYear,
    modelYear: vehicle.modelYear,
    mileage: vehicle.mileage,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    licensePlate: vehicle.licensePlate || '',
    vin: vehicle.vin || '',
    color: vehicle.exteriorColor || undefined,
    doors: vehicle.doors,
    imageUrl: vehicle.heroImageUrl,
    status: vehicle.status,
    armored: vehicle.armored,
    hasWarranty: vehicle.hasWarranty,
    eligibleForMetaAds: vehicle.eligibleForMetaAds,
    validationWarnings: warnings,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

function isBlockingWarning(warning: string): boolean {
  const normalized = warning.toLowerCase();
  return (
    normalized.includes('preço') ||
    normalized.includes('preco') ||
    normalized.includes('foto') ||
    normalized.includes('imagem') ||
    normalized.includes('essenciais ausentes')
  );
}

function countIssuesFromVehicles(
  vehicles: Array<Pick<Vehicle, 'validationWarnings' | 'eligibleForMetaAds'>>,
): { pendingIssuesCount: number; blockingIssuesCount: number } {
  let pendingIssuesCount = 0;
  let blockingIssuesCount = 0;

  for (const vehicle of vehicles) {
    const warnings = Array.isArray(vehicle.validationWarnings)
      ? (vehicle.validationWarnings as string[])
      : [];

    const hasWarnings = warnings.length > 0;
    const hasIssue = hasWarnings || !vehicle.eligibleForMetaAds;

    if (!hasIssue) continue;

    pendingIssuesCount += 1;
    if (!vehicle.eligibleForMetaAds || warnings.some(isBlockingWarning)) {
      blockingIssuesCount += 1;
    }
  }

  return { pendingIssuesCount, blockingIssuesCount };
}

function resolveCatalogStatus(
  healthScore: number,
  pendingIssuesCount: number,
  blockingIssuesCount: number,
): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (healthScore < 80 || blockingIssuesCount > 0) return 'CRITICAL';
  if (healthScore < 95 || pendingIssuesCount > 0) return 'WARNING';
  return 'HEALTHY';
}

export class DashboardService {
  async getStats(workspaceId: string): Promise<DashboardStats> {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [
      totalVehicles,
      availableVehicles,
      eligibleForMetaAds,
      newVehiclesThisMonth,
      issueVehicles,
      lastSync,
      lastMetaCatalog,
    ] = await Promise.all([
      prisma.vehicle.count({ where: { workspaceId } }),
      prisma.vehicle.count({ where: { workspaceId, status: VehicleStatus.AVAILABLE } }),
      prisma.vehicle.count({ where: { workspaceId, eligibleForMetaAds: true } }),
      prisma.vehicle.count({
        where: {
          workspaceId,
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.vehicle.findMany({
        where: { workspaceId },
        select: { validationWarnings: true, eligibleForMetaAds: true },
      }),
      prisma.syncHistory.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        include: {
          feedConfig: {
            select: { sourceType: true, feedUrl: true },
          },
        },
      }),
      prisma.metaCatalog.findFirst({
        where: { workspaceId },
        orderBy: { lastExportAt: 'desc' },
      }),
    ]);

    const { pendingIssuesCount, blockingIssuesCount } = countIssuesFromVehicles(issueVehicles);
    const healthScore = totalVehicles > 0
      ? Math.round((eligibleForMetaAds / totalVehicles) * 1000) / 10
      : 0;

    return {
      totalVehicles,
      availableVehicles,
      eligibleForMetaAds,
      pendingIssuesCount,
      blockingIssuesCount,
      newVehiclesThisMonth,
      healthScore,
      catalogStatus: resolveCatalogStatus(healthScore, pendingIssuesCount, blockingIssuesCount),
      lastDmsSync: {
        at: lastSync?.createdAt.toISOString() ?? null,
        durationMs: lastSync?.durationMs ?? null,
        sourceName: lastSync?.feedConfig?.sourceType ?? lastSync?.feedConfig?.feedUrl ?? null,
        status: lastSync?.status ?? null,
      },
      lastMetaExport: {
        at: lastMetaCatalog?.lastExportAt?.toISOString() ?? null,
        status: lastMetaCatalog?.lastExportStatus ?? null,
        catalogName: lastMetaCatalog?.catalogName ?? null,
      },
    };
  }

  async listVehicles(workspaceId: string, query: VehiclesListQuery) {
    const where: Prisma.VehicleWhereInput = { workspaceId };

    if (query.search) {
      where.OR = [
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { version: { contains: query.search, mode: 'insensitive' } },
        { licensePlate: { contains: query.search, mode: 'insensitive' } },
        { vin: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.make) {
      where.make = { equals: query.make, mode: 'insensitive' };
    }

    if (query.fuelType) {
      const fuel = query.fuelType.toUpperCase().replace(/\s+/g, '_') as Vehicle['fuelType'];
      where.fuelType = fuel;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.eligibleOnly) {
      where.eligibleForMetaAds = true;
    }

    const orderBy: Prisma.VehicleOrderByWithRelationInput =
      query.sortBy === 'price'
        ? { price: query.sortOrder }
        : query.sortBy === 'make'
          ? { make: query.sortOrder }
          : { updatedAt: query.sortOrder };

    const skip = (query.page - 1) * query.limit;

    const [total, vehicles] = await Promise.all([
      prisma.vehicle.count({ where }),
      prisma.vehicle.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
      }),
    ]);

    return {
      items: vehicles.map(mapVehicleToDTO),
      pagination: buildPagination(total, query.page, query.limit),
    };
  }

  async getVehicleById(workspaceId: string, vehicleId: string): Promise<VehicleDTO | null> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, workspaceId },
    });

    return vehicle ? mapVehicleToDTO(vehicle) : null;
  }

  async listMetaCatalogs(workspaceId: string): Promise<MetaCatalogSummary[]> {
    const catalogs = await prisma.metaCatalog.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });

    return catalogs.map((catalog) => {
      const healthScore = catalog.totalVehiclesCount > 0
        ? Math.round((catalog.eligibleVehiclesCount / catalog.totalVehiclesCount) * 1000) / 10
        : 0;

      return {
        id: catalog.id,
        catalogName: catalog.catalogName,
        metaCatalogId: catalog.metaCatalogId,
        feedFormat: catalog.feedFormat,
        publicFeedUrl: catalog.publicFeedUrl,
        totalVehiclesCount: catalog.totalVehiclesCount,
        eligibleVehiclesCount: catalog.eligibleVehiclesCount,
        lastExportAt: catalog.lastExportAt?.toISOString() ?? null,
        lastExportStatus: catalog.lastExportStatus,
        healthScore,
        dealershipId: catalog.dealershipId,
      };
    });
  }

  async listAuditLogs(workspaceId: string, query: AuditLogsQuery) {
    const where: Prisma.AuditLogWhereInput = { workspaceId };

    if (query.action) {
      where.action = { startsWith: query.action };
    }

    if (query.entityName) {
      where.entityName = query.entityName;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const skip = (query.page - 1) * query.limit;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);

    const items: AuditLogDTO[] = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityName: log.entityName,
      entityId: log.entityId,
      actorEmail: log.actorEmail,
      actorUserId: log.actorUserId,
      ipAddress: log.ipAddress,
      metadata: (log.metadata as Record<string, unknown> | null) ?? null,
      createdAt: log.createdAt.toISOString(),
    }));

    return {
      items,
      pagination: buildPagination(total, query.page, query.limit),
    };
  }
}

export const dashboardService = new DashboardService();
