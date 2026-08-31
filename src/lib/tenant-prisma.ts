import { prisma } from './prisma.js';

/**
 * Extensão do Prisma Client para garantir isolamento estrito de Multi-Tenancy.
 * Injeta automaticamente a cláusula `workspaceId` nas queries e mutations de entidades de tenant.
 *
 * @param workspaceId UUID do Workspace ativo da requisição
 */
export const createTenantPrisma = (workspaceId: string) => {
  if (!workspaceId) {
    throw new Error('TenantPrisma: workspaceId é obrigatório para operações com escopo de tenant.');
  }

  return prisma.$extends({
    name: 'tenantExtension',
    query: {
      vehicle: {
        async findMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as Record<string, unknown>).workspaceId = workspaceId;
          return query(args);
        },
        async updateMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async deleteMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        }
      },
      feedConfig: {
        async findMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as Record<string, unknown>).workspaceId = workspaceId;
          return query(args);
        }
      },
      dealership: {
        async findMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as Record<string, unknown>).workspaceId = workspaceId;
          return query(args);
        }
      },
      metaCatalog: {
        async findMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as Record<string, unknown>).workspaceId = workspaceId;
          return query(args);
        }
      },
      syncHistory: {
        async findMany({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...(args.where || {}), workspaceId };
          return query(args);
        },
        async create({ args, query }) {
          (args.data as Record<string, unknown>).workspaceId = workspaceId;
          return query(args);
        }
      }
    }
  });
};

export type TenantPrismaClient = ReturnType<typeof createTenantPrisma>;
