import { Subscription } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { PLAN_LIMITS } from './plan-limits.js';
import { PlanType, BillingInterval } from '../../types/checkout.js';

export interface CheckoutSessionPayload {
  id: string;
  customer?: string | null;
  subscription?: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
}

export interface InvoicePayload {
  id: string;
  customer?: string | null;
  subscription?: string | null;
  customer_email?: string | null;
  period_end?: number | null;
  attempt_count?: number | null;
}

export interface StripeSubscriptionPayload {
  id: string;
  customer?: string | null;
  metadata?: Record<string, string> | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
}

function resolvePlanTier(metadata?: Record<string, string> | null): PlanType {
  const plan = metadata?.plan;
  if (plan === 'STARTER' || plan === 'PRO' || plan === 'ENTERPRISE') {
    return plan;
  }
  return 'PRO';
}

function resolveBillingInterval(metadata?: Record<string, string> | null): BillingInterval {
  return metadata?.billingInterval === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
}

function calculatePeriodEnd(billingInterval: BillingInterval, fromUnix?: number | null): Date {
  if (fromUnix) {
    return new Date(fromUnix * 1000);
  }
  const end = new Date();
  if (billingInterval === 'YEARLY') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function subscriptionDataFromPlan(
  planTier: PlanType,
  billingInterval: BillingInterval,
  stripeIds: {
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
  },
  currentPeriodEnd: Date,
  status = 'ACTIVE'
) {
  return {
    planTier,
    maxVehicles: PLAN_LIMITS[planTier].maxVehicles === Infinity ? 999999 : PLAN_LIMITS[planTier].maxVehicles,
    status,
    currentPeriodEnd,
    stripeCustomerId: stripeIds.stripeCustomerId ?? null,
    stripeSubscriptionId: stripeIds.stripeSubscriptionId ?? null,
    stripePriceId: stripeIds.stripePriceId ?? null,
  };
}

export class SubscriptionService {
  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({ where: { stripeSubscriptionId } });
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<Subscription | null> {
    return prisma.subscription.findUnique({ where: { stripeCustomerId } });
  }

  async upsertForExistingUser(params: {
    workspaceId: string;
    session: CheckoutSessionPayload;
  }): Promise<Subscription> {
    const metadata = params.session.metadata ?? {};
    const planTier = resolvePlanTier(metadata);
    const billingInterval = resolveBillingInterval(metadata);
    const currentPeriodEnd = calculatePeriodEnd(billingInterval);

    return prisma.subscription.upsert({
      where: { workspaceId: params.workspaceId },
      create: {
        workspaceId: params.workspaceId,
        ...subscriptionDataFromPlan(planTier, billingInterval, {
          stripeCustomerId: params.session.customer,
          stripeSubscriptionId: params.session.subscription,
        }, currentPeriodEnd),
      },
      update: subscriptionDataFromPlan(planTier, billingInterval, {
        stripeCustomerId: params.session.customer,
        stripeSubscriptionId: params.session.subscription,
      }, currentPeriodEnd),
    });
  }

  async renewFromInvoice(invoice: InvoicePayload): Promise<Subscription | null> {
    const stripeSubscriptionId = invoice.subscription as string | undefined;
    if (!stripeSubscriptionId) {
      return null;
    }

    const subscription = await this.findByStripeSubscriptionId(stripeSubscriptionId);
    if (!subscription) {
      return null;
    }

    const currentPeriodEnd = invoice.period_end
      ? new Date(invoice.period_end * 1000)
      : subscription.currentPeriodEnd;

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd,
      },
    });
  }

  async markPastDue(invoice: InvoicePayload): Promise<{ subscription: Subscription; suspended: boolean } | null> {
    const stripeSubscriptionId = invoice.subscription as string | undefined;
    if (!stripeSubscriptionId) {
      return null;
    }

    const subscription = await this.findByStripeSubscriptionId(stripeSubscriptionId);
    if (!subscription) {
      return null;
    }

    const attemptCount = invoice.attempt_count ?? 1;
    const shouldSuspend = attemptCount >= 3;

    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: shouldSuspend ? 'SUSPENDED' : 'PAST_DUE' },
      });

      if (shouldSuspend) {
        await tx.workspace.update({
          where: { id: subscription.workspaceId },
          data: { status: 'SUSPENDED' },
        });
      }

      return sub;
    });

    return { subscription: updated, suspended: shouldSuspend };
  }

  async cancelSubscription(stripeSubscriptionId: string): Promise<Subscription | null> {
    const subscription = await this.findByStripeSubscriptionId(stripeSubscriptionId);
    if (!subscription) {
      return null;
    }

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
      },
    });
  }

  async updatePlanFromStripe(stripeSub: StripeSubscriptionPayload): Promise<Subscription | null> {
    const subscription = await this.findByStripeSubscriptionId(stripeSub.id);
    if (!subscription) {
      return null;
    }

    const planTier = resolvePlanTier(stripeSub.metadata);
    const currentPeriodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : subscription.currentPeriodEnd;
    const stripePriceId = stripeSub.items?.data?.[0]?.price?.id ?? subscription.stripePriceId;

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planTier,
        maxVehicles: PLAN_LIMITS[planTier].maxVehicles === Infinity ? 999999 : PLAN_LIMITS[planTier].maxVehicles,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end ?? subscription.cancelAtPeriodEnd,
        stripePriceId,
      },
    });
  }
}

export const subscriptionService = new SubscriptionService();
