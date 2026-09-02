import { prisma } from '../../lib/prisma.js';
import { createAuthError } from '../auth/auth.service.js';
import { UpdateWorkspaceProfileDTO } from '../../schemas/profile.js';

export interface WorkspaceProfileResult {
  workspace: {
    id: string;
    name: string;
    slug: string;
    cnpj: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
  };
  dealership: {
    id: string;
    tradeName: string;
    legalName: string | null;
    cnpj: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    logoUrl: string | null;
    email: string | null;
  };
}

export interface UpdateWorkspaceProfileContext {
  actorUserId: string;
  actorEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

function profileNotFoundError(detail: string) {
  return createAuthError(detail, 404);
}

export class ProfileService {
  private async getPrimaryDealership(workspaceId: string) {
    return prisma.dealership.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getWorkspaceProfile(workspaceId: string): Promise<WorkspaceProfileResult> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw profileNotFoundError(`Workspace "${workspaceId}" nao encontrado.`);
    }

    const dealership = await this.getPrimaryDealership(workspaceId);

    if (!dealership) {
      throw profileNotFoundError('Nenhuma concessionaria principal encontrada para este workspace.');
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        cnpj: workspace.cnpj,
        phone: workspace.phone,
        city: workspace.city,
        state: workspace.state,
      },
      dealership: {
        id: dealership.id,
        tradeName: dealership.tradeName,
        legalName: dealership.legalName,
        cnpj: dealership.cnpj,
        phone: dealership.phone,
        city: dealership.city,
        state: dealership.state,
        logoUrl: dealership.logoUrl,
        email: dealership.email,
      },
    };
  }

  async updateWorkspaceProfile(
    workspaceId: string,
    data: UpdateWorkspaceProfileDTO,
    ctx: UpdateWorkspaceProfileContext,
  ): Promise<WorkspaceProfileResult> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw profileNotFoundError(`Workspace "${workspaceId}" nao encontrado.`);
    }

    const dealership = await this.getPrimaryDealership(workspaceId);

    if (!dealership) {
      throw profileNotFoundError('Nenhuma concessionaria principal encontrada para este workspace.');
    }

    const changedFields = Object.keys(data).filter(
      (key) => data[key as keyof UpdateWorkspaceProfileDTO] !== undefined,
    );

    const workspaceUpdate: {
      name?: string;
      cnpj?: string;
      phone?: string;
      city?: string;
      state?: string;
    } = {};

    const dealershipUpdate: {
      tradeName?: string;
      cnpj?: string;
      phone?: string;
      city?: string;
      state?: string;
      logoUrl?: string | null;
    } = {};

    if (data.tradeName !== undefined) {
      workspaceUpdate.name = data.tradeName;
      dealershipUpdate.tradeName = data.tradeName;
    }
    if (data.cnpj !== undefined) {
      workspaceUpdate.cnpj = data.cnpj;
      dealershipUpdate.cnpj = data.cnpj;
    }
    if (data.phone !== undefined) {
      workspaceUpdate.phone = data.phone;
      dealershipUpdate.phone = data.phone;
    }
    if (data.city !== undefined) {
      workspaceUpdate.city = data.city;
      dealershipUpdate.city = data.city;
    }
    if (data.state !== undefined) {
      workspaceUpdate.state = data.state;
      dealershipUpdate.state = data.state;
    }
    if (data.logoUrl !== undefined) {
      dealershipUpdate.logoUrl = data.logoUrl;
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(workspaceUpdate).length > 0) {
        await tx.workspace.update({
          where: { id: workspaceId },
          data: workspaceUpdate,
        });
      }

      if (Object.keys(dealershipUpdate).length > 0) {
        await tx.dealership.update({
          where: { id: dealership.id },
          data: dealershipUpdate,
        });
      }

      await tx.auditLog.create({
        data: {
          workspaceId,
          actorUserId: ctx.actorUserId,
          actorEmail: ctx.actorEmail,
          action: 'WORKSPACE_PROFILE_UPDATED',
          entityName: 'Workspace',
          entityId: workspaceId,
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent?.substring(0, 500) ?? null,
          metadata: { changedFields },
        },
      });
    });

    return this.getWorkspaceProfile(workspaceId);
  }
}

export const profileService = new ProfileService();
