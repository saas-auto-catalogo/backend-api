import Stripe from 'stripe';
import { prisma } from '../../lib/prisma.js';
import { emailService } from '../../services/email/emailService.js';
import { StripeWebhookResult } from '../../services/payments/stripePaymentService.js';
import { writeBillingAuditLog } from './billing-audit.js';
import {
  subscriptionService,
  CheckoutSessionPayload,
  InvoicePayload,
  StripeSubscriptionPayload,
} from './subscription.service.js';

export class StripeWebhookService {
  async processEvent(event: Stripe.Event): Promise<StripeWebhookResult> {
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existing) {
      return {
        received: true,
        action: 'IGNORED',
        details: { reason: 'duplicate_event', stripeEventId: event.id },
      };
    }

    let result: StripeWebhookResult;

    switch (event.type) {
      case 'checkout.session.completed':
        result = await this.handleCheckoutCompleted(event);
        break;
      case 'invoice.payment_succeeded':
        result = await this.handleInvoicePaymentSucceeded(event);
        break;
      case 'invoice.payment_failed':
        result = await this.handleInvoicePaymentFailed(event);
        break;
      case 'customer.subscription.deleted':
        result = await this.handleSubscriptionDeleted(event);
        break;
      case 'customer.subscription.updated':
        result = await this.handleSubscriptionUpdated(event);
        break;
      case 'payment_intent.succeeded':
        result = { received: true, action: 'IGNORED', details: { reason: 'legacy_pix_flow' } };
        break;
      default:
        result = { received: true, action: 'IGNORED' };
    }

    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
      },
    });

    return result;
  }

  /** Test helper: process mock event object without Stripe.Event typing */
  async processMockEvent(event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown>; previous_attributes?: Record<string, unknown> };
  }): Promise<StripeWebhookResult> {
    return this.processEvent(event as unknown as Stripe.Event);
  }

  private async handleCheckoutCompleted(event: Stripe.Event): Promise<StripeWebhookResult> {
    const session = event.data.object as CheckoutSessionPayload;
    const metadata = session.metadata ?? {};
    const metadataWorkspaceId = metadata.workspaceId?.trim();
    const customerEmail = (
      metadata.customerEmail ||
      session.customer_email ||
      session.customer_details?.email ||
      ''
    ).toLowerCase().trim();
    const plan = metadata.plan || 'PRO';

    if (metadataWorkspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: metadataWorkspaceId },
      });

      if (!workspace) {
        return {
          received: true,
          action: 'IGNORED',
          details: { reason: 'workspace_not_found', workspaceId: metadataWorkspaceId },
        };
      }

      const subscription = await subscriptionService.upsertForExistingUser({
        workspaceId: metadataWorkspaceId,
        session,
      });

      await writeBillingAuditLog({
        workspaceId: metadataWorkspaceId,
        action: 'SUBSCRIPTION_PROVISIONED',
        entityId: subscription.id,
        metadata: {
          stripeEventId: event.id,
          plan,
          customerEmail,
          mode: 'workspace_checkout',
        },
      });

      if (customerEmail) {
        await emailService.sendPaymentApprovedEmail(customerEmail, {
          userName: customerEmail.split('@')[0],
          planName: `Plano ${plan}`,
          amountFormatted: 'Assinatura ativa',
          paymentMethod: 'Cartão de Crédito',
          dashboardUrl: `${process.env.FRONTEND_URL || 'https://app.drivesync.me'}/dashboard`,
        });
      }

      return {
        received: true,
        action: 'PROVISION_TENANT',
        status: 'ACTIVE',
        workspaceId: metadataWorkspaceId,
        details: { email: customerEmail, plan, mode: 'workspace_checkout' },
      };
    }

    console.warn(
      '[stripe-webhook] checkout.session.completed ignored: missing metadata.workspaceId',
      { sessionId: session.id, customerEmail: customerEmail || undefined },
    );

    return {
      received: true,
      action: 'IGNORED',
      details: {
        reason: 'missing_workspace_id',
        ...(customerEmail ? { customerEmail } : {}),
      },
    };
  }

  private async handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<StripeWebhookResult> {
    const invoice = event.data.object as InvoicePayload;
    const subscription = await subscriptionService.renewFromInvoice(invoice);

    if (!subscription) {
      return {
        received: true,
        action: 'IGNORED',
        details: { reason: 'subscription_not_found', invoiceId: invoice.id },
      };
    }

    await writeBillingAuditLog({
      workspaceId: subscription.workspaceId,
      action: 'SUBSCRIPTION_RENEWED',
      entityId: subscription.id,
      metadata: { stripeEventId: event.id, invoiceId: invoice.id },
    });

    return {
      received: true,
      action: 'RENEW_SUBSCRIPTION',
      status: 'ACTIVE',
      workspaceId: subscription.workspaceId,
      details: { invoiceId: invoice.id, email: invoice.customer_email },
    };
  }

  private async handleInvoicePaymentFailed(event: Stripe.Event): Promise<StripeWebhookResult> {
    const invoice = event.data.object as InvoicePayload;
    const result = await subscriptionService.markPastDue(invoice);

    if (!result) {
      return {
        received: true,
        action: 'IGNORED',
        details: { reason: 'subscription_not_found', invoiceId: invoice.id },
      };
    }

    const { subscription, suspended } = result;
    const attemptCount = invoice.attempt_count ?? 1;

    await writeBillingAuditLog({
      workspaceId: subscription.workspaceId,
      action: suspended ? 'WORKSPACE_SUSPENDED' : 'SUBSCRIPTION_PAST_DUE',
      entityId: subscription.id,
      metadata: {
        stripeEventId: event.id,
        invoiceId: invoice.id,
        attemptCount,
        previousStatus: 'ACTIVE',
      },
    });

    return {
      received: true,
      action: suspended ? 'SUSPEND_WORKSPACE' : 'PAYMENT_FAILED_ALERT',
      status: suspended ? 'SUSPENDED' : 'PAST_DUE',
      workspaceId: subscription.workspaceId,
      details: { invoiceId: invoice.id, attemptCount, shouldSuspend: suspended, email: invoice.customer_email },
    };
  }

  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<StripeWebhookResult> {
    const stripeSub = event.data.object as StripeSubscriptionPayload;
    const subscription = await subscriptionService.cancelSubscription(stripeSub.id);

    if (!subscription) {
      return {
        received: true,
        action: 'IGNORED',
        details: { reason: 'subscription_not_found', subscriptionId: stripeSub.id },
      };
    }

    const customerEmail = (stripeSub.metadata?.customerEmail as string) || 'cliente@drivesync.me';

    await writeBillingAuditLog({
      workspaceId: subscription.workspaceId,
      action: 'SUBSCRIPTION_CANCELED',
      entityId: subscription.id,
      metadata: { stripeEventId: event.id, subscriptionId: stripeSub.id },
    });

    await emailService.sendSubscriptionCanceledEmail(customerEmail, {
      userName: 'Cliente',
      planName: `Plano ${subscription.planTier}`,
      accessUntilDate: subscription.currentPeriodEnd.toLocaleDateString('pt-BR'),
      reactivateUrl: `${process.env.FRONTEND_URL || 'https://app.drivesync.me'}/settings/billing`,
    });

    return {
      received: true,
      action: 'CANCEL_SUBSCRIPTION',
      status: 'CANCELED',
      workspaceId: subscription.workspaceId,
      details: { subscriptionId: stripeSub.id, email: customerEmail },
    };
  }

  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<StripeWebhookResult> {
    const stripeSub = event.data.object as StripeSubscriptionPayload;
    const subscription = await subscriptionService.updatePlanFromStripe(stripeSub);

    if (!subscription) {
      return {
        received: true,
        action: 'IGNORED',
        details: { reason: 'subscription_not_found', subscriptionId: stripeSub.id },
      };
    }

    const previousAttributes = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes;

    await writeBillingAuditLog({
      workspaceId: subscription.workspaceId,
      action: 'SUBSCRIPTION_PLAN_CHANGED',
      entityId: subscription.id,
      metadata: {
        stripeEventId: event.id,
        newPlan: subscription.planTier,
        changedFields: previousAttributes ? Object.keys(previousAttributes) : [],
      },
    });

    return {
      received: true,
      action: 'UPDATE_PLAN_LIMITS',
      status: 'UPDATED',
      workspaceId: subscription.workspaceId,
      details: {
        subscriptionId: stripeSub.id,
        newPlan: subscription.planTier,
        changedFields: previousAttributes ? Object.keys(previousAttributes) : [],
      },
    };
  }
}

export const stripeWebhookService = new StripeWebhookService();
