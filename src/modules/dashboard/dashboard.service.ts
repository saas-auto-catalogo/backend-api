import { FuelType, MetaCatalog, Prisma, SyncStatus, Vehicle, VehicleStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { AuditLogsQuery, ActivityQuery, VehiclesListQuery } from '../../schemas/dashboard.js';

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
  heroImageUrl?: string;
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

export type CatalogIssueType = 'MISSING_IMAGES' | 'PRICE_ZERO' | 'INVALID_VIN' | 'YEAR_INVALID';
export type CatalogIssueSeverity = 'BLOCKING' | 'WARNING';

export interface CatalogIssueItem {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  licensePlate: string;
  issueType: CatalogIssueType;
  severity: CatalogIssueSeverity;
  description: string;
  recommendation: string;
  detectedAt: string;
  imageUrl?: string;
}

export interface ActivityEventDTO {
  id: string;
  type: string;
  title: string;
  description: string;
  occurredAt: string;
}

const EXCLUDED_AUDIT_ACTIONS = [
  'SUPER_ADMIN_INITIALIZED',
  'WORKSPACE_INITIALIZED',
  'FEED_SYNC_COMPLETED',
] as const;

const ISSUE_RECOMMENDATIONS: Record<CatalogIssueType, string> = {
  MISSING_IMAGES: 'Adicione pelo menos 1 foto HD no seu gestor DMS.',
  PRICE_ZERO: 'Informe o valor de tabela no DMS para liberar no Meta Ads.',
  INVALID_VIN: 'Corrija o número do chassi no cadastro do DMS.',
  YEAR_INVALID: 'Revise o ano/modelo no sistema de estoque.',
};

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

function formatFeedSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    AUTOCERTO: 'AutoCerto',
    ALTIMUS: 'Altimus',
    SISVAG: 'SisVag',
    BOMCONTROLE: 'Bom Controle',
    WEBMOTORS: 'Webmotors',
    BASE44: 'Base44',
    SPICE_DIGITAL: 'Spice Digital',
    GENERIC_XML: 'XML Genérico',
    GENERIC_JSON: 'JSON Genérico',
    CUSTOM_API: 'API Customizada',
  };

  return labels[sourceType] ?? sourceType;
}

function getMetadataMessage(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'message' in metadata) {
    const message = (metadata as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }

  return null;
}

type SyncHistoryActivityRow = {
  id: string;
  status: SyncStatus;
  totalIngested: number;
  durationMs: number;
  errorMessage: string | null;
  createdAt: Date;
  feedConfig: { sourceType: string };
};

type AuditLogActivityRow = {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: Date;
};

function mapSyncHistoryToActivity(sync: SyncHistoryActivityRow): ActivityEventDTO {
  const sourceLabel = formatFeedSourceLabel(sync.feedConfig.sourceType);
  const isSuccess =
    sync.status === SyncStatus.SUCCESS || sync.status === SyncStatus.PARTIAL_SUCCESS;
  const durationSec = (sync.durationMs / 1000).toFixed(1);

  return {
    id: `sync:${sync.id}`,
    type: isSuccess ? 'SYNC_DMS' : 'SYNC_FAILED',
    title: `Ingestão de Feed DMS ${sourceLabel}`,
    description: isSuccess
      ? `${sync.totalIngested} veículos processados em ${durationSec}s`
      : sync.errorMessage ?? 'Falha na sincronização do feed DMS',
    occurredAt: sync.createdAt.toISOString(),
  };
}

function mapAuditLogToActivity(log: AuditLogActivityRow): ActivityEventDTO | null {
  if (log.action.startsWith('FEED_SYNC_')) {
    return null;
  }

  const titles: Record<string, string> = {
    PRICE_CHANGED: 'Alteração de Preço Promocional',
    VEHICLE_UPDATED: 'Veículo Atualizado',
  };

  const metadataMessage = getMetadataMessage(log.metadata);

  return {
    id: `audit:${log.id}`,
    type: log.action,
    title: titles[log.action] ?? log.action.replace(/_/g, ' '),
    description: metadataMessage ?? `Ação registrada: ${log.action}`,
    occurredAt: log.createdAt.toISOString(),
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
    heroImageUrl: vehicle.heroImageUrl,
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
    normalized.includes('imagens') ||
    normalized.includes('essenciais ausentes')
  );
}

function classifyValidationWarning(warning: string): {
  issueType: CatalogIssueType;
  severity: CatalogIssueSeverity;
} {
  const normalized = warning.toLowerCase();

  if (
    normalized.includes('foto') ||
    normalized.includes('imagem') ||
    normalized.includes('imagens')
  ) {
    return { issueType: 'MISSING_IMAGES', severity: 'BLOCKING' };
  }

  if (
    normalized.includes('preço') ||
    normalized.includes('preco') ||
    normalized.includes('consulta')
  ) {
    return { issueType: 'PRICE_ZERO', severity: 'BLOCKING' };
  }

  if (normalized.includes('chassi') || normalized.includes('vin')) {
    return { issueType: 'INVALID_VIN', severity: 'WARNING' };
  }

  if (normalized.includes('ano') || normalized.includes('essenciais ausentes')) {
    return { issueType: 'YEAR_INVALID', severity: 'WARNING' };
  }

  return { issueType: 'YEAR_INVALID', severity: 'WARNING' };
}

function resolveIssueSeverity(
  warning: string,
  classified: CatalogIssueSeverity,
): CatalogIssueSeverity {
  if (classified === 'BLOCKING' || isBlockingWarning(warning)) {
    return 'BLOCKING';
  }
  return 'WARNING';
}

function parseValidationWarnings(
  validationWarnings: Vehicle['validationWarnings'],
): string[] {
  if (Array.isArray(validationWarnings)) {
    return validationWarnings as string[];
  }
  if (validationWarnings) {
    return [String(validationWarnings)];
  }
  return [];
}

type IssueVehicleRow = Pick<
  Vehicle,
  | 'id'
  | 'make'
  | 'model'
  | 'version'
  | 'licensePlate'
  | 'heroImageUrl'
  | 'validationWarnings'
  | 'eligibleForMetaAds'
  | 'updatedAt'
>;

function mapVehicleToCatalogIssues(vehicle: IssueVehicleRow): CatalogIssueItem[] {
  const warnings = parseValidationWarnings(vehicle.validationWarnings);
  const displayModel = vehicle.version
    ? `${vehicle.model} ${vehicle.version}`.trim()
    : vehicle.model;
  const imageUrl = vehicle.heroImageUrl || undefined;
  const detectedAt = vehicle.updatedAt.toISOString();

  if (warnings.length === 0 && !vehicle.eligibleForMetaAds) {
    return [
      {
        id: `${vehicle.id}:PRICE_ZERO:0`,
        vehicleId: vehicle.id,
        make: vehicle.make,
        model: displayModel,
        licensePlate: vehicle.licensePlate || '',
        issueType: 'PRICE_ZERO',
        severity: 'BLOCKING',
        description: 'Veículo inelegível para Meta Ads DAA.',
        recommendation: 'Revise preço, fotos e dados obrigatórios no DMS.',
        detectedAt,
        imageUrl,
      },
    ];
  }

  return warnings.map((warning, index) => {
    const classified = classifyValidationWarning(warning);
    const severity = resolveIssueSeverity(warning, classified.severity);

    return {
      id: `${vehicle.id}:${classified.issueType}:${index}`,
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: displayModel,
      licensePlate: vehicle.licensePlate || '',
      issueType: classified.issueType,
      severity,
      description: warning,
      recommendation: ISSUE_RECOMMENDATIONS[classified.issueType],
      detectedAt,
      imageUrl,
    };
  });
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

      const fuel = query.fuelType.toUpperCase().replace(/\s+/g, '_');

      if (fuel === 'HYBRID_EV') {

        where.fuelType = {

          in: [

            FuelType.HIBRIDO,

            FuelType.HIBRIDO_PLUG_IN,

            FuelType.MHEV_HIBRIDO_LEVE,

            FuelType.ELETRICO,

          ],

        };

      } else if (Object.values(FuelType).includes(fuel as FuelType)) {

        where.fuelType = fuel as Vehicle['fuelType'];

      }

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

  async listVehicleMakes(workspaceId: string): Promise<string[]> {

    const rows = await prisma.vehicle.findMany({

      where: { workspaceId },

      distinct: ['make'],

      orderBy: { make: 'asc' },

      select: { make: true },

    });

    return rows.map((row) => row.make);

  }

  async getVehicleById(workspaceId: string, vehicleId: string): Promise<VehicleDTO | null> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, workspaceId },
    });

    return vehicle ? mapVehicleToDTO(vehicle) : null;
  }

  async listMetaCatalogs(workspaceId: string, baseUrl?: string): Promise<MetaCatalogSummary[]> {
    let catalogs = await prisma.metaCatalog.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });

    if (catalogs.length === 0) {
      const provisioned = await this.provisionMetaCatalogForWorkspace(workspaceId, baseUrl);
      if (provisioned) {
        catalogs = [provisioned];
      }
    } else if (baseUrl && catalogs.some((c) => !c.publicFeedUrl || c.publicFeedUrl.includes('localhost/'))) {
      const feedConfig = await prisma.feedConfig.findFirst({
        where: { workspaceId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (feedConfig) {
        const correctUrl = `${baseUrl}/api/v1/feeds/${feedConfig.activeTokenHash}/meta-vehicles.xml`;
        await prisma.metaCatalog.updateMany({
          where: { workspaceId },
          data: { publicFeedUrl: correctUrl },
        });
        catalogs = await prisma.metaCatalog.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' },
        });
      }
    }

    return catalogs.map(mapMetaCatalogToSummary);
  }

  private async provisionMetaCatalogForWorkspace(
    workspaceId: string,
    baseUrl?: string,
  ): Promise<MetaCatalog | null> {
    const feedConfig = await prisma.feedConfig.findFirst({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: { workspace: true },
    });
    if (!feedConfig) return null;

    const [totalVehiclesCount, eligibleVehiclesCount] = await Promise.all([
      prisma.vehicle.count({ where: { workspaceId } }),
      prisma.vehicle.count({ where: { workspaceId, eligibleForMetaAds: true } }),
    ]);

    const publicFeedUrl = baseUrl
      ? `${baseUrl}/api/v1/feeds/${feedConfig.activeTokenHash}/meta-vehicles.xml`
      : null;

    const lastSyncStatus = feedConfig.lastSyncStatus ?? null;
    const catalogName = `${feedConfig.workspace.name} - Catálogo Meta Automotive Ads`;

    return prisma.metaCatalog.create({
      data: {
        workspaceId,
        dealershipId: feedConfig.dealershipId,
        catalogName,
        feedFormat: 'XML_DAA',
        publicFeedUrl,
        totalVehiclesCount,
        eligibleVehiclesCount,
        lastExportAt: feedConfig.lastSyncAt ?? null,
        lastExportStatus: lastSyncStatus,
      },
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

  async listDashboardIssues(workspaceId: string): Promise<CatalogIssueItem[]> {
    const vehicles = await prisma.vehicle.findMany({
      where: { workspaceId },
      select: {
        id: true,
        make: true,
        model: true,
        version: true,
        licensePlate: true,
        heroImageUrl: true,
        validationWarnings: true,
        eligibleForMetaAds: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const items: CatalogIssueItem[] = [];

    for (const vehicle of vehicles) {
      const warnings = parseValidationWarnings(vehicle.validationWarnings);
      const hasIssue = warnings.length > 0 || !vehicle.eligibleForMetaAds;

      if (!hasIssue) continue;

      items.push(...mapVehicleToCatalogIssues(vehicle));
    }

    return items;
  }

  async listDashboardActivity(
    workspaceId: string,
    query: ActivityQuery,
  ): Promise<ActivityEventDTO[]> {
    const { limit } = query;

    const [syncHistories, auditLogs] = await Promise.all([
      prisma.syncHistory.findMany({
        where: { workspaceId },
        select: {
          id: true,
          status: true,
          totalIngested: true,
          durationMs: true,
          errorMessage: true,
          createdAt: true,
          feedConfig: { select: { sourceType: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.auditLog.findMany({
        where: {
          workspaceId,
          action: { notIn: [...EXCLUDED_AUDIT_ACTIONS] },
        },
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const syncEvents = syncHistories.map(mapSyncHistoryToActivity);
    const auditEvents = auditLogs
      .map(mapAuditLogToActivity)
      .filter((event): event is ActivityEventDTO => event !== null);

    return [...syncEvents, ...auditEvents]
      .sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )
      .slice(0, limit);
  }
}

function mapMetaCatalogToSummary(catalog: MetaCatalog): MetaCatalogSummary {
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
}

export const dashboardService = new DashboardService();
