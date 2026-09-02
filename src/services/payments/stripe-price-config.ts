import { BillingInterval, PlanType } from '../../types/checkout.js';

const PRICE_ENV_KEYS: Record<PlanType, Record<BillingInterval, string>> = {
  STARTER: {
    MONTHLY: 'STRIPE_STARTER_MONTHLY_PRICE_ID',
    YEARLY: 'STRIPE_STARTER_YEARLY_PRICE_ID',
  },
  PRO: {
    MONTHLY: 'STRIPE_PRO_MONTHLY_PRICE_ID',
    YEARLY: 'STRIPE_PRO_YEARLY_PRICE_ID',
  },
  ENTERPRISE: {
    MONTHLY: 'STRIPE_ENTERPRISE_MONTHLY_PRICE_ID',
    YEARLY: 'STRIPE_ENTERPRISE_YEARLY_PRICE_ID',
  },
};

export class StripePriceConfigError extends Error {
  constructor(
    public readonly plan: PlanType,
    public readonly billingInterval: BillingInterval,
    public readonly envKey: string
  ) {
    super(`Missing Stripe price ID: set ${envKey} for plan ${plan} (${billingInterval})`);
    this.name = 'StripePriceConfigError';
  }
}

export function resolveStripePriceId(plan: PlanType, billingInterval: BillingInterval): string {
  const envKey = PRICE_ENV_KEYS[plan][billingInterval];
  const priceId = process.env[envKey];

  if (!priceId) {
    throw new StripePriceConfigError(plan, billingInterval, envKey);
  }

  return priceId;
}
