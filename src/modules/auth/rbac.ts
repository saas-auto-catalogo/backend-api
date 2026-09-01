import { Role } from '@prisma/client';

export { Role };

/**
 * Hierarquia numérica de papéis (quanto maior o número, mais privilégios)
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 1,
  MANAGER: 2,
  OWNER: 3,
  SUPER_ADMIN: 4,
};

/**
 * Matriz de Recursos e Ações por Role
 */
export const PERMISSIONS = {
  // Gestão Global do SaaS (apenas Super Admin)
  GLOBAL_WORKSPACES_LIST: ['SUPER_ADMIN'] as Role[],
  GLOBAL_SETTINGS_MANAGE: ['SUPER_ADMIN'] as Role[],
  IMPERSONATE_USER: ['SUPER_ADMIN'] as Role[],

  // Gestão do Workspace / Concessionária
  WORKSPACE_SETTINGS_EDIT: ['SUPER_ADMIN', 'OWNER'] as Role[],
  WORKSPACE_MEMBERS_MANAGE: ['SUPER_ADMIN', 'OWNER'] as Role[],
  WORKSPACE_BILLING_MANAGE: ['SUPER_ADMIN', 'OWNER'] as Role[],

  // Integrações (Meta Ads, DMS)
  META_ADS_CONNECT: ['SUPER_ADMIN', 'OWNER'] as Role[],
  META_ADS_DIAGNOSTICS_VIEW: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] as Role[],

  // Gestão de Feeds e Estoque
  FEEDS_CREATE: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] as Role[],
  FEEDS_EDIT: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] as Role[],
  FEEDS_DELETE: ['SUPER_ADMIN', 'OWNER'] as Role[],
  FEEDS_SYNC_TRIGGER: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] as Role[],
  FEEDS_VIEW: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'] as Role[],

  // Visualização de Estoque e Catálogo
  VEHICLES_VIEW: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'VIEWER'] as Role[],
  VEHICLES_EDIT: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] as Role[],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/**
 * Verifica se a role do usuário possui o nível mínimo exigido
 */
export function hasMinimumRole(userRole: Role, minimumRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Verifica se a role do usuário está autorizada para uma lista de roles permitidas
 */
export function isRoleAllowed(userRole: Role, allowedRoles: Role[]): boolean {
  if (userRole === 'SUPER_ADMIN') return true;
  return allowedRoles.includes(userRole);
}

/**
 * Verifica se a role possui uma permissão específica do sistema
 */
export function hasPermission(userRole: Role, permission: PermissionKey): boolean {
  if (userRole === 'SUPER_ADMIN') return true;
  const allowed = PERMISSIONS[permission];
  return allowed ? allowed.includes(userRole) : false;
}
