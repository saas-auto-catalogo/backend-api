import { MetaCatalog } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { MetaCatalogItem } from './meta-graph.client.js';

export class DealershipNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Nenhuma concessionaria encontrada para o workspace "${workspaceId}".`);
    this.name = 'DealershipNotFoundError';
  }
}

export interface UpsertMetaCatalogFromOAuthInput {
  workspaceId: string;
  catalogName?: string;
  catalogs: MetaCatalogItem[];
}

export class MetaConnectorService {
  private async getPrimaryDealership(workspaceId: string) {
    return prisma.dealership.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private resolveCatalogName(
    catalogName: string | undefined,
    catalogs: MetaCatalogItem[],
    dealershipTradeName: string,
  ): string {
    return catalogName || catalogs[0]?.name || dealershipTradeName || 'Catálogo Meta Ads DAA';
  }

  async upsertMetaCatalogFromOAuth(input: UpsertMetaCatalogFromOAuthInput): Promise<MetaCatalog> {
    const { workspaceId, catalogName, catalogs } = input;

    const existingMetaCatalog = await prisma.metaCatalog.findFirst({
      where: { workspaceId },
    });

    if (existingMetaCatalog) {
      return prisma.metaCatalog.update({
        where: { id: existingMetaCatalog.id },
        data: {
          metaCatalogId: catalogs[0]?.id || existingMetaCatalog.metaCatalogId,
          catalogName: catalogName || catalogs[0]?.name || existingMetaCatalog.catalogName,
        },
      });
    }

    const dealership = await this.getPrimaryDealership(workspaceId);

    if (!dealership) {
      throw new DealershipNotFoundError(workspaceId);
    }

    return prisma.metaCatalog.create({
      data: {
        workspaceId,
        dealershipId: dealership.id,
        catalogName: this.resolveCatalogName(catalogName, catalogs, dealership.tradeName),
        metaCatalogId: catalogs[0]?.id ?? null,
        feedFormat: 'XML_DAA',
        totalVehiclesCount: 0,
        eligibleVehiclesCount: 0,
      },
    });
  }
}

export const metaConnectorService = new MetaConnectorService();
