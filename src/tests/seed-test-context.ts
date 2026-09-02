import { prisma } from '../lib/prisma.js';
import { AuthUser } from '../modules/auth/auth.middleware.js';
import { Role } from '../modules/auth/rbac.js';

export interface IntegrationSeedContext {
  fromDatabase: boolean;
  workspaceAId: string;
  workspaceBId: string;
  superAdmin: AuthUser;
  ownerA: AuthUser;
  managerA: AuthUser;
  viewerA: AuthUser;
  ownerB: AuthUser;
}

function fallbackContext(): IntegrationSeedContext {
  const workspaceAId = 'workspace-tenant-a';
  const workspaceBId = 'workspace-tenant-b';

  return {
    fromDatabase: false,
    workspaceAId,
    workspaceBId,
    superAdmin: {
      id: 'usr-super-admin-01',
      email: 'admin@autocatalogo.com.br',
      name: 'Super Admin',
      isSuperAdmin: true,
      role: 'SUPER_ADMIN',
    },
    ownerA: {
      id: 'usr-owner-tenant-a',
      email: 'owner@autoelite.com.br',
      name: 'Carlos Owner Tenant A',
      isSuperAdmin: false,
      workspaceId: workspaceAId,
      dealershipId: 'dealership-a-01',
      role: 'OWNER',
    },
    managerA: {
      id: 'usr-manager-tenant-a',
      email: 'manager@autoelite.com.br',
      name: 'Marcos Manager Tenant A',
      isSuperAdmin: false,
      workspaceId: workspaceAId,
      role: 'MANAGER',
    },
    viewerA: {
      id: 'usr-viewer-tenant-a',
      email: 'viewer@autoelite.com.br',
      name: 'Ana Viewer Tenant A',
      isSuperAdmin: false,
      workspaceId: workspaceAId,
      role: 'VIEWER',
    },
    ownerB: {
      id: 'usr-owner-tenant-b',
      email: 'owner@jrcasa.com.br',
      name: 'Roberto Owner Tenant B',
      isSuperAdmin: false,
      workspaceId: workspaceBId,
      role: 'OWNER',
    },
  };
}

function toAuthUser(
  user: {
    id: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
  },
  workspaceId: string,
  role: Role,
  dealershipId?: string,
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    workspaceId,
    dealershipId,
    role,
  };
}

export async function loadIntegrationSeedContext(): Promise<IntegrationSeedContext> {
  try {
    await prisma.$connect();

    const [workspaceA, workspaceB, superAdmin, ownerA, managerA, viewerA, ownerB] = await Promise.all([
      prisma.workspace.findFirst({
        where: { slug: 'auto-elite-motors' },
        include: { dealerships: { take: 1 } },
      }),
      prisma.workspace.findFirst({ where: { slug: 'jr-casa-seminovos' } }),
      prisma.user.findFirst({ where: { email: 'admin@autocatalogo.com.br' } }),
      prisma.user.findFirst({
        where: { email: 'carlos.silva@autoelitemotors.com.br' },
        include: { memberships: true },
      }),
      prisma.user.findFirst({
        where: { email: 'marcos.trafego@autoelitemotors.com.br' },
        include: { memberships: true },
      }),
      prisma.user.findFirst({
        where: { email: 'ana.vendas@autoelitemotors.com.br' },
        include: { memberships: true },
      }),
      prisma.user.findFirst({
        where: { email: 'roberto.junior@jrcaseminovos.com.br' },
        include: { memberships: true },
      }),
    ]);

    if (!workspaceA || !workspaceB || !superAdmin || !ownerA || !managerA || !viewerA || !ownerB) {
      return fallbackContext();
    }

    const ownerAMembership = ownerA.memberships.find((membership) => membership.workspaceId === workspaceA.id);
    const managerAMembership = managerA.memberships.find((membership) => membership.workspaceId === workspaceA.id);
    const viewerAMembership = viewerA.memberships.find((membership) => membership.workspaceId === workspaceA.id);
    const ownerBMembership = ownerB.memberships.find((membership) => membership.workspaceId === workspaceB.id);

    return {
      fromDatabase: true,
      workspaceAId: workspaceA.id,
      workspaceBId: workspaceB.id,
      superAdmin: toAuthUser(superAdmin, workspaceA.id, 'SUPER_ADMIN'),
      ownerA: toAuthUser(
        ownerA,
        workspaceA.id,
        (ownerAMembership?.role || 'OWNER') as Role,
        workspaceA.dealerships[0]?.id,
      ),
      managerA: toAuthUser(managerA, workspaceA.id, (managerAMembership?.role || 'MANAGER') as Role),
      viewerA: toAuthUser(viewerA, workspaceA.id, (viewerAMembership?.role || 'VIEWER') as Role),
      ownerB: toAuthUser(ownerB, workspaceB.id, (ownerBMembership?.role || 'OWNER') as Role),
    };
  } catch {
    return fallbackContext();
  }
}
