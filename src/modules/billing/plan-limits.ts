import { PlanType } from '../../types/checkout.js';

export interface PlanConfig {
  name: string;
  maxVehicles: number;
  maxFeeds: number;
  maxMembers: number;
  maxMetaCatalogs: number;
  hasAiBlogWorker: boolean;
  hasPrioritySupport: boolean;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanConfig> = {
  STARTER: {
    name: 'Starter Catalog',
    maxVehicles: 50,
    maxFeeds: 1,
    maxMembers: 2,
    maxMetaCatalogs: 1,
    hasAiBlogWorker: false,
    hasPrioritySupport: false,
    monthlyPriceCents: 9700, // R$ 97,00
    yearlyPriceCents: 97000, // R$ 970,00
  },
  PRO: {
    name: 'Pro Automotive',
    maxVehicles: 200,
    maxFeeds: 5,
    maxMembers: 10,
    maxMetaCatalogs: 3,
    hasAiBlogWorker: true,
    hasPrioritySupport: false,
    monthlyPriceCents: 19700, // R$ 197,00
    yearlyPriceCents: 197000, // R$ 1.970,00
  },
  ENTERPRISE: {
    name: 'Enterprise DAA',
    maxVehicles: Infinity,
    maxFeeds: Infinity,
    maxMembers: Infinity,
    maxMetaCatalogs: Infinity,
    hasAiBlogWorker: true,
    hasPrioritySupport: true,
    monthlyPriceCents: 39700, // R$ 397,00
    yearlyPriceCents: 397000, // R$ 3.970,00
  },
};

export type ResourceLimitKey = 'vehicles' | 'feeds' | 'members' | 'metaCatalogs';
export type PlanFeatureKey = 'aiBlogWorker' | 'prioritySupport';

/**
 * Valida se um plano atingiu o limite de um recurso numérico
 */
export function isResourceLimitReached(
  plan: PlanType,
  resource: ResourceLimitKey,
  currentCount: number
): { reached: boolean; maxAllowed: number; current: number } {
  const planConfig = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;

  let maxAllowed = 0;
  switch (resource) {
    case 'vehicles':
      maxAllowed = planConfig.maxVehicles;
      break;
    case 'feeds':
      maxAllowed = planConfig.maxFeeds;
      break;
    case 'members':
      maxAllowed = planConfig.maxMembers;
      break;
    case 'metaCatalogs':
      maxAllowed = planConfig.maxMetaCatalogs;
      break;
  }

  return {
    reached: currentCount >= maxAllowed,
    maxAllowed,
    current: currentCount,
  };
}

/**
 * Valida se um plano possui acesso a uma feature booleana específica
 */
export function hasPlanFeature(plan: PlanType, feature: PlanFeatureKey): boolean {
  const planConfig = PLAN_LIMITS[plan] || PLAN_LIMITS.STARTER;

  switch (feature) {
    case 'aiBlogWorker':
      return planConfig.hasAiBlogWorker;
    case 'prioritySupport':
      return planConfig.hasPrioritySupport;
    default:
      return false;
  }
}

/**
 * Status de subscription que concede limites/features do planTier
 */
export function isEntitledSubscriptionStatus(status: string): boolean {
  return status === 'ACTIVE' || status === 'TRIALING';
}

/**
 * Calcula o término do trial de 14 dias
 */
export function calculateTrialEndDate(startDate: Date = new Date()): Date {
  const trialEnd = new Date(startDate);
  trialEnd.setDate(trialEnd.getDate() + 14);
  return trialEnd;
}
