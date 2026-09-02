import { prisma } from '../../lib/prisma.js';
import { getSystemUserId, SYSTEM_USER_EMAIL } from '../../lib/system-user.js';
import { Prisma } from '@prisma/client';

export type BillingAuditAction =
  | 'SUBSCRIPTION_PROVISIONED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_PLAN_CHANGED'
  | 'WORKSPACE_SUSPENDED';

export async function writeBillingAuditLog(params: {
  workspaceId: string;
  action: BillingAuditAction;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const actorUserId = await getSystemUserId();

  await prisma.auditLog.create({
    data: {
      workspaceId: params.workspaceId,
      actorUserId,
      actorEmail: SYSTEM_USER_EMAIL,
      action: params.action,
      entityName: 'Subscription',
      entityId: params.entityId ?? null,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
