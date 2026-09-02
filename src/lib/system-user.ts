import { prisma } from './prisma.js';

export const SYSTEM_USER_EMAIL = 'stripe-webhook@system.internal';

let cachedSystemUserId: string | null = null;

export async function getSystemUserId(): Promise<string> {
  if (cachedSystemUserId) {
    return cachedSystemUserId;
  }

  const user = await prisma.user.findUnique({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`System user not found: ${SYSTEM_USER_EMAIL}. Run prisma seed.`);
  }

  cachedSystemUserId = user.id;
  return user.id;
}

export function resetSystemUserCacheForTests(): void {
  cachedSystemUserId = null;
}
