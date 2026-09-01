import { FastifyRequest, FastifyReply } from 'fastify';
import { Role, isRoleAllowed, hasPermission, PermissionKey } from './rbac.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  workspaceId?: string;
  dealershipId?: string;
  role?: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/**
 * Middleware preHandler que valida o token JWT do cabeçalho Authorization
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        type: 'https://autocatalogo.com.br/errors/unauthorized',
        title: 'Não Autorizado',
        status: 401,
        detail: 'Token JWT de autenticação ausente ou formato inválido. Utilize o formato: Bearer <token>',
        instance: request.url,
      });
      return;
    }

    // Validação usando o decorator do @fastify/jwt
    const decoded = await request.jwtVerify<AuthUser>();
    request.user = decoded;
  } catch (err) {
    reply.status(401).send({
      type: 'https://autocatalogo.com.br/errors/unauthorized',
      title: 'Token Inválido ou Expirado',
      status: 401,
      detail: (err as Error).message || 'Assinatura JWT inválida ou token expirado.',
      instance: request.url,
    });
  }
}

/**
 * Factory de middleware preHandler para exigir papéis específicos (RBAC)
 */
export function requireRole(allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as AuthUser | undefined;
    if (!user) {
      reply.status(401).send({
        type: 'https://autocatalogo.com.br/errors/unauthorized',
        title: 'Não Autenticado',
        status: 401,
        detail: 'Autenticação necessária antes de validar permissões.',
        instance: request.url,
      });
      return;
    }

    const userRole = user.role || (user.isSuperAdmin ? 'SUPER_ADMIN' : 'VIEWER');

    if (!isRoleAllowed(userRole, allowedRoles)) {
      reply.status(403).send({
        type: 'https://autocatalogo.com.br/errors/forbidden',
        title: 'Acesso Proibido',
        status: 403,
        detail: `Seu papel atual (${userRole}) não possui permissão para executar esta ação. Papéis permitidos: ${allowedRoles.join(', ')}`,
        instance: request.url,
      });
    }
  };
}

/**
 * Factory de middleware preHandler para exigir uma permissão de negócio específica
 */
export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as AuthUser | undefined;
    if (!user) {
      reply.status(401).send({
        type: 'https://autocatalogo.com.br/errors/unauthorized',
        title: 'Não Autenticado',
        status: 401,
        detail: 'Autenticação necessária antes de validar permissões.',
        instance: request.url,
      });
      return;
    }

    const userRole = user.role || (user.isSuperAdmin ? 'SUPER_ADMIN' : 'VIEWER');

    if (!hasPermission(userRole, permission)) {
      reply.status(403).send({
        type: 'https://autocatalogo.com.br/errors/forbidden',
        title: 'Acesso Proibido',
        status: 403,
        detail: `Permissão negada: "${permission}".`,
        instance: request.url,
      });
    }
  };
}

/**
 * Middleware preHandler que garante o isolamento multi-tenant (Multi-Tenant Isolation)
 * Valida se o workspaceId da rota corresponde ao workspaceId do usuário autenticado.
 * Super Admins têm bypass automático deste isolamento.
 */
export async function requireWorkspace(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as AuthUser | undefined;
  if (!user) {
    reply.status(401).send({
      type: 'https://autocatalogo.com.br/errors/unauthorized',
      title: 'Não Autenticado',
      status: 401,
      detail: 'Autenticação necessária para acessar recursos de workspace.',
      instance: request.url,
    });
    return;
  }

  // Super Admins têm acesso global a qualquer workspace
  if (user.isSuperAdmin || user.role === 'SUPER_ADMIN') {
    return;
  }

  const params = request.params as Record<string, string | undefined>;
  const requestedWorkspaceId = params.workspaceId || params.wsId;

  if (!requestedWorkspaceId) {
    return;
  }

  if (user.workspaceId !== requestedWorkspaceId) {
    reply.status(403).send({
      type: 'https://autocatalogo.com.br/errors/tenant-isolation-violation',
      title: 'Violação de Isolamento Multi-Tenant',
      status: 403,
      detail: `Você não tem autorização para acessar os dados do workspace "${requestedWorkspaceId}". Seu tenant autorizado é "${user.workspaceId || 'NENHUM'}".`,
      instance: request.url,
    });
  }
}
