import { Vehicle, VehicleStatus } from '@prisma/client';
import { CanonicalVehicleOutput } from '../normalization/index.js';
import { DiffResult } from './diff-types.js';

export class StockDiffEngine {
  /**
   * Calcula as diferenças entre o estoque existente no banco e os veículos recebidos no feed.
   *
   * @param existingVehicles Lista de veículos atualmente registrados no banco para o feed/workspace
   * @param incomingVehicles Lista de veículos canônicos extraídos e normalizados do feed atual
   */
  static computeDiff(
    existingVehicles: Array<Partial<Vehicle> & { id: string; externalId: string }>,
    incomingVehicles: CanonicalVehicleOutput[]
  ): DiffResult {
    const existingMap = new Map<string, Partial<Vehicle> & { id: string; externalId: string }>();
    for (const v of existingVehicles) {
      existingMap.set(v.externalId, v);
    }

    const toCreate: CanonicalVehicleOutput[] = [];
    const toUpdate: Array<{
      vehicle: CanonicalVehicleOutput;
      existingId: string;
      changedFields: string[];
    }> = [];
    const unchanged: CanonicalVehicleOutput[] = [];
    const seenExternalIds = new Set<string>();

    // 1. Itera sobre os veículos recebidos no feed atual
    for (const incoming of incomingVehicles) {
      seenExternalIds.add(incoming.externalId);
      const existing = existingMap.get(incoming.externalId);

      if (!existing) {
        // Veículo novo no estoque
        toCreate.push(incoming);
      } else {
        // Veículo já existente no banco -> Compara hashes e campos críticos
        const changedFields = this.detectChangedFields(existing, incoming);

        if (changedFields.length > 0) {
          toUpdate.push({
            vehicle: incoming,
            existingId: existing.id,
            changedFields
          });
        } else {
          unchanged.push(incoming);
        }
      }
    }

    // 2. Identifica veículos que estavam no banco mas NÃO vieram no feed atual (Vendidos/Removidos)
    const toRemove: Array<{
      id: string;
      externalId: string;
      currentStatus: VehicleStatus;
    }> = [];

    for (const [extId, existing] of existingMap.entries()) {
      if (!seenExternalIds.has(extId)) {
        // Apenas marca como vendido se ainda não estiver vendido
        if (existing.status !== VehicleStatus.SOLD) {
          toRemove.push({
            id: existing.id,
            externalId: existing.externalId,
            currentStatus: (existing.status as VehicleStatus) || VehicleStatus.AVAILABLE
          });
        }
      }
    }

    return {
      toCreate,
      toUpdate,
      toRemove,
      unchanged,
      totalIngested: incomingVehicles.length,
      totalCreated: toCreate.length,
      totalUpdated: toUpdate.length,
      totalRemoved: toRemove.length,
      totalUnchanged: unchanged.length,
      totalErrors: 0
    };
  }

  /**
   * Detecta campos que sofreram alteração entre o banco e o feed recebido.
   */
  private static detectChangedFields(
    existing: Partial<Vehicle>,
    incoming: CanonicalVehicleOutput
  ): string[] {
    const changes: string[] = [];

    // Se o hash do payload bruto for idêntico e os campos essenciais coincidirem, garante que nada mudou
    if (
      existing.rawPayloadHash &&
      existing.rawPayloadHash === incoming.rawPayloadHash &&
      existing.heroImageUrl === incoming.heroImageUrl &&
      existing.eligibleForMetaAds === incoming.eligibleForMetaAds
    ) {
      return changes;
    }

    // Comparação de Preço
    if (existing.price !== undefined && existing.price !== null) {
      const currentPrice = Number(existing.price);
      if (Math.abs(currentPrice - incoming.price) > 0.01) {
        changes.push(`price: ${currentPrice} -> ${incoming.price}`);
      }
    }

    // Comparação de Preço Promocional
    if (existing.promotionalPrice !== undefined) {
      const currentPromo = existing.promotionalPrice !== null ? Number(existing.promotionalPrice) : undefined;
      if (currentPromo !== incoming.promotionalPrice) {
        changes.push(`promotionalPrice: ${currentPromo} -> ${incoming.promotionalPrice}`);
      }
    }

    // Comparação de Quilometragem
    if (existing.mileage !== undefined && existing.mileage !== incoming.mileage) {
      changes.push(`mileage: ${existing.mileage} -> ${incoming.mileage}`);
    }

    // Comparação de Foto de Capa
    if (existing.heroImageUrl !== undefined && existing.heroImageUrl !== incoming.heroImageUrl) {
      changes.push('heroImageUrl');
    }

    // Comparação de Status
    if (existing.status && existing.status !== incoming.status) {
      changes.push(`status: ${existing.status} -> ${incoming.status}`);
    }

    // Comparação de Título
    if (existing.title && existing.title !== incoming.title) {
      changes.push(`title: "${existing.title}" -> "${incoming.title}"`);
    }

    // Comparação de Elegibilidade Meta Ads
    if (existing.eligibleForMetaAds !== undefined && existing.eligibleForMetaAds !== incoming.eligibleForMetaAds) {
      changes.push(`eligibleForMetaAds: ${existing.eligibleForMetaAds} -> ${incoming.eligibleForMetaAds}`);
    }

    // Se o hash divergiu mas nenhum campo simples mudou, marca alteração genérica (ex: opcionais ou descrição)
    if (changes.length === 0 && existing.rawPayloadHash !== incoming.rawPayloadHash) {
      changes.push('rawPayloadHash/attributes');
    }

    return changes;
  }
}
