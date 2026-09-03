import { Subscription } from '@prisma/client';
import { PLAN_LIMITS } from './plan-limits.js';
import { PlanType } from '../../types/checkout.js';

export interface WorkspaceBillingDetails {
  workspaceId: string;
  planTier: PlanType | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: (typeof PLAN_LIMITS)[PlanType] | null;
}

export function formatWorkspaceBilling(
  workspaceId: string,
  sub: Subscription | null,
): WorkspaceBillingDetails {
  if (!sub) {
    return {
      workspaceId,
      planTier: null,
      status: 'NONE',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: null,
    };
  }

  if (sub.status === 'EXPIRED') {
    return {
      workspaceId,
      planTier: null,
      status: 'EXPIRED',
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      limits: null,
    };
  }

  const planTier = sub.planTier as PlanType;
  const planLimits = PLAN_LIMITS[planTier] || PLAN_LIMITS.PRO;

  return {
    workspaceId,
    planTier,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    limits: planLimits,
  };
}
