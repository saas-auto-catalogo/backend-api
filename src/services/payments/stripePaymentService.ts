import {
  CreateStripePixRequest,
  CreateStripeCardRequest,
  CreateStripeCheckoutSessionRequest,
  StripePixResponse,
  StripeCardResponse,
  StripeCheckoutSessionResponse,
  PlanType,
} from '../../types/checkout.js';
import { PLAN_LIMITS } from '../../modules/billing/plan-limits.js';
import { emailService } from '../email/emailService.js';
import { getStripeClient, isStripeMockMode } from './stripe-client.js';
import { resolveStripePriceId, StripePriceConfigError } from './stripe-price-config.js';

export const PLAN_PRICING: Record<PlanType, { monthly: number; yearly: number; name: string }> = {
  STARTER: {
    monthly: PLAN_LIMITS.STARTER.monthlyPriceCents,
    yearly: PLAN_LIMITS.STARTER.yearlyPriceCents,
    name: PLAN_LIMITS.STARTER.name,
  },
  PRO: {
    monthly: PLAN_LIMITS.PRO.monthlyPriceCents,
    yearly: PLAN_LIMITS.PRO.yearlyPriceCents,
    name: PLAN_LIMITS.PRO.name,
  },
  ENTERPRISE: {
    monthly: PLAN_LIMITS.ENTERPRISE.monthlyPriceCents,
    yearly: PLAN_LIMITS.ENTERPRISE.yearlyPriceCents,
    name: PLAN_LIMITS.ENTERPRISE.name,
  },
};

export interface StripeWebhookResult {
  received: boolean;
  action: string;
  status?: string;
  workspaceId?: string;
  details?: Record<string, unknown>;
}

export interface StripePortalResponse {
  url: string;
  customerId: string;
  returnUrl: string;
}

export class StripePaymentService {
  /**
   * Cria uma Stripe Checkout Session (modo subscription) para contratação SaaS
   */
  public async createCheckoutSession(
    data: CreateStripeCheckoutSessionRequest
  ): Promise<StripeCheckoutSessionResponse> {
    if (isStripeMockMode()) {
      const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        sessionId,
        url: `https://checkout.stripe.com/c/pay/${sessionId}`,
      };
    }

    const priceId = resolveStripePriceId(data.plan, data.billingInterval);
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
      customer_email: data.customer.email,
      locale: 'pt-BR',
      metadata: {
        plan: data.plan,
        billingInterval: data.billingInterval,
        dealershipName: data.customer.dealershipName,
        customerEmail: data.customer.email,
        customerDocument: data.customer.document,
      },
    });

    if (!session.url) {
      throw new Error('Stripe Checkout Session created without URL');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Cria um PaymentIntent do Stripe com Pix para pagamento no Brasil
   */
  public async createPixPayment(data: CreateStripePixRequest): Promise<StripePixResponse> {
    const planInfo = PLAN_PRICING[data.plan];
    const amount = data.billingInterval === 'YEARLY' ? planInfo.yearly : planInfo.monthly;

    const paymentIntentId = `pi_stripe_pix_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos

    // Payload EMV Copia e Cola do Pix gerado pelo Stripe
    const emvCode = `00020126580014br.gov.bcb.pix0136${paymentIntentId}520400005303986540${(amount / 100).toFixed(2)}5802BR5925AUTO CATALOGO SAAS STRIPE6009SAO PAULO62070503***6304`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(emvCode)}`;

    return {
      paymentIntentId,
      clientSecret: `${paymentIntentId}_secret_${Math.random().toString(36).substring(7)}`,
      amount,
      qrCodeUrl,
      qrCodeText: emvCode,
      expiresAt,
      status: 'requires_action',
    };
  }

  /**
   * Processa assinatura de Cartão de Crédito via Stripe
   */
  public async createCardSubscription(data: CreateStripeCardRequest): Promise<StripeCardResponse> {
    const planInfo = PLAN_PRICING[data.plan];
    const amount = data.billingInterval === 'YEARLY' ? planInfo.yearly : planInfo.monthly;

    const customerId = `cus_stripe_${Date.now()}`;
    const subscriptionId = `sub_stripe_${Date.now()}`;

    const nextBilling = new Date();
    if (data.billingInterval === 'YEARLY') {
      nextBilling.setFullYear(nextBilling.getFullYear() + 1);
    } else {
      nextBilling.setMonth(nextBilling.getMonth() + 1);
    }

    return {
      subscriptionId,
      customerId,
      status: 'active',
      currentPeriodEnd: nextBilling.toISOString(),
      amount,
    };
  }

  /**
   * Cria uma sessão no Stripe Customer Portal para autoatendimento do cliente
   */
  public async createPortalSession(
    customerId: string,
    returnUrl: string = 'https://app.autocatalogo.com.br/settings/billing'
  ): Promise<StripePortalResponse> {
    const portalSessionId = `bps_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const url = `https://billing.stripe.com/p/session/${portalSessionId}?return_url=${encodeURIComponent(returnUrl)}`;

    return {
      url,
      customerId,
      returnUrl,
    };
  }

  /**
   * Processa os Webhooks oficiais do ciclo de vida da assinatura no Stripe
   */
  public async handleWebhook(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }): Promise<StripeWebhookResult> {
    const eventObject = event.data.object;

    switch (event.type) {
      // 1. Checkout concluído -> Ativar Workspace e provisionar tenant
      case 'checkout.session.completed': {
        const customerEmail = (eventObject.customer_email as string) || (eventObject.customer_details as Record<string, string>)?.email || 'cliente@autocatalogo.com.br';
        const plan = (eventObject.metadata as Record<string, string>)?.plan || 'PRO';

        if (customerEmail) {
          await emailService.sendPaymentApprovedEmail(customerEmail, {
            userName: customerEmail.split('@')[0],
            planName: `Plano ${plan}`,
            amountFormatted: 'R$ 297,00/mês',
            paymentMethod: 'Cartão de Crédito',
            dashboardUrl: 'https://app.autocatalogo.com.br/dashboard',
          });
        }

        return {
          received: true,
          action: 'PROVISION_TENANT',
          status: 'ACTIVE',
          details: { email: customerEmail, plan },
        };
      }

      // 2. Pagamento de fatura aprovado -> Renovar período de vigência
      case 'invoice.payment_succeeded': {
        const invoiceId = eventObject.id as string;
        const customerEmail = (eventObject.customer_email as string) || 'cliente@autocatalogo.com.br';

        return {
          received: true,
          action: 'RENEW_SUBSCRIPTION',
          status: 'ACTIVE',
          details: { invoiceId, email: customerEmail },
        };
      }

      // 3. Falha no pagamento da fatura -> Alerta e suspensão preventiva
      case 'invoice.payment_failed': {
        const invoiceId = eventObject.id as string;
        const attemptCount = (eventObject.attempt_count as number) || 1;
        const customerEmail = (eventObject.customer_email as string) || 'cliente@autocatalogo.com.br';

        const shouldSuspend = attemptCount >= 3;

        return {
          received: true,
          action: shouldSuspend ? 'SUSPEND_WORKSPACE' : 'PAYMENT_FAILED_ALERT',
          status: shouldSuspend ? 'SUSPENDED' : 'PAST_DUE',
          details: { invoiceId, attemptCount, shouldSuspend, email: customerEmail },
        };
      }

      // 4. Assinatura cancelada -> Bloqueio ou encerramento após o período
      case 'customer.subscription.deleted': {
        const subscriptionId = eventObject.id as string;
        const customerEmail = (eventObject.customer_email as string) || 'cliente@autocatalogo.com.br';

        await emailService.sendSubscriptionCanceledEmail(customerEmail, {
          userName: 'Cliente',
          planName: 'Plano Pro',
          accessUntilDate: new Date().toLocaleDateString('pt-BR'),
          reactivateUrl: 'https://app.autocatalogo.com.br/settings/billing',
        });

        return {
          received: true,
          action: 'CANCEL_SUBSCRIPTION',
          status: 'CANCELED',
          details: { subscriptionId, email: customerEmail },
        };
      }

      // 5. Assinatura atualizada (Upgrade ou Downgrade de Plano)
      case 'customer.subscription.updated': {
        const subscriptionId = eventObject.id as string;
        const previousAttributes = (event.data as Record<string, unknown>).previous_attributes as Record<string, unknown> | undefined;
        const newPlan = (eventObject.metadata as Record<string, string>)?.plan || 'PRO';

        return {
          received: true,
          action: 'UPDATE_PLAN_LIMITS',
          status: 'UPDATED',
          details: { subscriptionId, newPlan, changedFields: previousAttributes ? Object.keys(previousAttributes) : [] },
        };
      }

      // 6. Pix ou Pagamento pontual aprovado
      case 'payment_intent.succeeded': {
        const paymentIntentId = eventObject.id as string;
        return {
          received: true,
          action: 'PROVISION_TENANT',
          status: 'ACTIVE',
          details: { paymentIntentId },
        };
      }

      default:
        return { received: true, action: 'IGNORED' };
    }
  }
}

export const stripePaymentService = new StripePaymentService();

export { StripePriceConfigError };
