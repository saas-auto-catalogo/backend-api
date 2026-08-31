import { PrismaClient } from '@prisma/client';

declare global {
  // Permite reutilizar a instância do Prisma Client no ambiente de desenvolvimento
  // evitando esgotar o pool de conexões do PostgreSQL com hot reload
  // eslint-disable-next-line no-var
  var globalPrisma: PrismaClient | undefined;
}

export const prisma =
  global.globalPrisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  global.globalPrisma = prisma;
}

export default prisma;
