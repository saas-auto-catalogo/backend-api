import { PrismaClient, VehicleStatus, SyncStatus, BodyStyle, FuelType, TransmissionType, VehicleCondition } from '@prisma/client';
import { prisma as defaultPrisma } from '../../lib/prisma.js';
import { feedCacheService } from '../../infra/cache/feed-cache.service.js';
import { CanonicalVehicleOutput } from '../normalization/index.js';
import { StockDiffEngine } from './stock-diff.engine.js';
import { DiffResult, SyncExecutionResult } from './diff-types.js';

export interface StockSyncOptions {
  prismaClient?: PrismaClient;
  dealershipId?: string;
  autoInvalidateCache?: boolean;
}

export class StockSyncService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  /**
   * Executa a sincronização completa de estoque calculando diffs, aplicando no banco,
   * gerando telemetria na tabela SyncHistory e invalidando caches Redis se necessário.
   */
  async syncStock(
    workspaceId: string,
    feedConfigId: string,
    incomingVehicles: CanonicalVehicleOutput[],
    options: StockSyncOptions = {}
  ): Promise<SyncExecutionResult> {
    const startTime = Date.now();
    const prisma = options.prismaClient || this.prisma;
    const autoInvalidate = options.autoInvalidateCache ?? true;

    try {
      // 1. Busca os veículos atualmente existentes no banco de dados para este feed
      const existingVehicles = await prisma.vehicle.findMany({
        where: {
          workspaceId,
          feedConfigId
        },
        select: {
          id: true,
          externalId: true,
          make: true,
          model: true,
          version: true,
          title: true,
          price: true,
          promotionalPrice: true,
          mileage: true,
          heroImageUrl: true,
          status: true,
          rawPayloadHash: true,
          eligibleForMetaAds: true,
          canonicalUrl: true
        }
      });

      // 2. Calcula as diferenças (Diff Engine)
      const diff: DiffResult = StockDiffEngine.computeDiff(existingVehicles as any, incomingVehicles);

      // 3. Aplica as mutações no banco de dados

      // 3.1 Criação de novos veículos
      for (const item of diff.toCreate) {
        await prisma.vehicle.create({
          data: {
            workspaceId,
            feedConfigId,
            dealershipId: options.dealershipId,
            externalId: item.externalId,
            vin: item.vin,
            licensePlate: item.licensePlate,
            stockNumber: item.stockNumber,
            make: item.make,
            model: item.model,
            version: item.version,
            title: item.title,
            bodyStyle: (item.bodyStyle as BodyStyle) || BodyStyle.OTHER,
            manufactureYear: item.manufactureYear,
            modelYear: item.modelYear,
            doors: item.doors,
            exteriorColor: item.exteriorColor,
            interiorColor: item.interiorColor,
            mileage: item.mileage,
            fuelType: (item.fuelType as FuelType) || FuelType.OUTRO,
            transmission: (item.transmission as TransmissionType) || TransmissionType.OUTRO,
            engineSize: item.engineSize,
            drivetrain: item.drivetrain,
            armored: item.armored,
            price: item.price,
            promotionalPrice: item.promotionalPrice,
            currency: item.currency || 'BRL',
            priceOnRequest: item.priceOnRequest,
            condition: (item.condition as VehicleCondition) || VehicleCondition.USADO,
            status: VehicleStatus.AVAILABLE,
            hasWarranty: item.hasWarranty,
            warrantyDetails: item.warrantyDetails,
            canonicalUrl: item.canonicalUrl,
            heroImageUrl: item.heroImageUrl,
            images: item.images as any,
            features: item.features,
            description: item.description,
            notes: item.notes,
            rawPayloadHash: item.rawPayloadHash,
            eligibleForMetaAds: item.eligibleForMetaAds,
            validationWarnings: item.validationWarnings
          }
        });
      }

      // 3.2 Atualização de veículos modificados
      for (const upd of diff.toUpdate) {
        const item = upd.vehicle;
        await prisma.vehicle.update({
          where: { id: upd.existingId },
          data: {
            make: item.make,
            model: item.model,
            version: item.version,
            title: item.title,
            bodyStyle: (item.bodyStyle as BodyStyle) || BodyStyle.OTHER,
            manufactureYear: item.manufactureYear,
            modelYear: item.modelYear,
            doors: item.doors,
            exteriorColor: item.exteriorColor,
            interiorColor: item.interiorColor,
            mileage: item.mileage,
            fuelType: (item.fuelType as FuelType) || FuelType.OUTRO,
            transmission: (item.transmission as TransmissionType) || TransmissionType.OUTRO,
            armored: item.armored,
            price: item.price,
            promotionalPrice: item.promotionalPrice,
            priceOnRequest: item.priceOnRequest,
            condition: (item.condition as VehicleCondition) || VehicleCondition.USADO,
            status: VehicleStatus.AVAILABLE,
            hasWarranty: item.hasWarranty,
            warrantyDetails: item.warrantyDetails,
            canonicalUrl: item.canonicalUrl,
            heroImageUrl: item.heroImageUrl,
            images: item.images as any,
            features: item.features,
            description: item.description,
            notes: item.notes,
            rawPayloadHash: item.rawPayloadHash,
            eligibleForMetaAds: item.eligibleForMetaAds,
            validationWarnings: item.validationWarnings,
            updatedAt: new Date()
          }
        });
      }

      // 3.3 Exclusão de veículos que saíram do feed (Substituição de Estoque)
      if (diff.toRemove.length > 0) {
        const removeIds = diff.toRemove.map((r) => r.id);
        await prisma.vehicle.deleteMany({
          where: { id: { in: removeIds } }
        });
      }

      const durationMs = Date.now() - startTime;
      const syncStatus = diff.totalErrors > 0 ? SyncStatus.PARTIAL_SUCCESS : SyncStatus.SUCCESS;

      // 4. Cria registro detalhado de histórico na tabela SyncHistory
      const syncHistory = await prisma.syncHistory.create({
        data: {
          workspaceId,
          feedConfigId,
          status: syncStatus,
          totalIngested: diff.totalIngested,
          totalCreated: diff.totalCreated,
          totalUpdated: diff.totalUpdated,
          totalUnchanged: diff.totalUnchanged,
          totalRemoved: diff.totalRemoved,
          totalErrors: diff.totalErrors,
          durationMs,
          details: {
            updatedFieldsSample: diff.toUpdate.slice(0, 10).map((u) => ({
              externalId: u.vehicle.externalId,
              changes: u.changedFields
            })),
            removedExternalIds: diff.toRemove.map((r) => r.externalId)
          } as any
        }
      });

      // 5. Atualiza o FeedConfig com o status da última sincronização
      await prisma.feedConfig.update({
        where: { id: feedConfigId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: syncStatus,
          lastSyncMessage: `Sincronização concluída: +${diff.totalCreated} novos, ~${diff.totalUpdated} atualizados, -${diff.totalRemoved} removidos, =${diff.totalUnchanged} inalterados (${durationMs}ms).`
        }
      });


      // 5.5 Mantém o MetaCatalog com contagens de estoque e exportação atualizadas
      const [totalVehiclesCount, eligibleVehiclesCount] = await Promise.all([
        prisma.vehicle.count({ where: { workspaceId, status: VehicleStatus.AVAILABLE } }),
        prisma.vehicle.count({ where: { workspaceId, status: VehicleStatus.AVAILABLE, eligibleForMetaAds: true } }),
      ]);
      await prisma.metaCatalog.updateMany({
        where: { workspaceId },
        data: {
          totalVehiclesCount,
          eligibleVehiclesCount,
          lastExportAt: new Date(),
          lastExportStatus: syncStatus,
        },
      });
      // 6. Invalidação de Cache Redis se houve mutações no estoque
      let cacheInvalidated = false;
      const hasMutations = diff.totalCreated > 0 || diff.totalUpdated > 0 || diff.totalRemoved > 0;

      if (autoInvalidate && hasMutations) {
        await feedCacheService.invalidateWorkspaceFeeds(workspaceId);
        cacheInvalidated = true;
      }

      return {
        syncHistoryId: syncHistory.id,
        status: syncStatus,
        diff,
        durationMs,
        cacheInvalidated
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Registra falha no FeedConfig
      await prisma.feedConfig.update({
        where: { id: feedConfigId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: SyncStatus.FAILED,
          lastSyncMessage: `Erro na sincronização: ${errorMsg}`
        }
      }).catch(() => {});

      // Registra histórico de falha
      await prisma.syncHistory.create({
        data: {
          workspaceId,
          feedConfigId,
          status: SyncStatus.FAILED,
          totalIngested: incomingVehicles.length,
          totalCreated: 0,
          totalUpdated: 0,
          totalUnchanged: 0,
          totalRemoved: 0,
          totalErrors: 1,
          durationMs,
          errorMessage: errorMsg
        }
      }).catch(() => {});

      throw error;
    }
  }
}
