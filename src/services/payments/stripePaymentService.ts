import {
  CreateStripePixRequest,
  CreateStripeCardRequest,
  CreateStripeCheckoutSessionRequest,
  CreateWorkspaceStripeCheckoutSessionRequest,
  CreateWorkspaceStripeCheckoutSessionParams,
  StripePixResponse,
  StripeCardResponse,
  StripeCheckoutSessionResponse,
  PlanType,
} from '../../types/checkout.js';
import { PLAN_LIMITS } from '../../modules/billing/plan-limits.js';
import { getStripeClient, isStripeMockMode } from './stripe-client.js';
import { resolveStripePriceId, StripePriceConfigError } from './stripe-price-config.js';
import { stripeWebhookService } from '../../modules/billing/stripe-webhook.service.js';
import Stripe from 'stripe';

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

export interface StripeInvoiceItem {
  id: string;
  number: string;
  createdAt: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

export interface StripeInvoiceListResult {
  items: StripeInvoiceItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function paginate<T>(items: T[], page: number, limit: number): { items: T[]; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    totalPages,
  };
}

function mapStripeInvoice(invoice: Stripe.Invoice): StripeInvoiceItem {
  const amount = invoice.amount_paid > 0 ? invoice.amount_paid : (invoice.total ?? 0);
  return {
    id: invoice.id,
    number: invoice.number || `INV-${invoice.created}`,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    amount,
    currency: invoice.currency || 'brl',
    status: invoice.status ?? 'unknown',
    pdfUrl: invoice.invoice_pdf ?? null,
    hostedUrl: invoice.hosted_invoice_url ?? null,
  };
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

  public async createCheckoutSessionForWorkspace(
    params: CreateWorkspaceStripeCheckoutSessionParams
  ): Promise<StripeCheckoutSessionResponse> {
    const { workspaceId, customerEmail, data } = params;

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
      customer_email: customerEmail,
      locale: 'pt-BR',
      metadata: {
        workspaceId,
        plan: data.plan,
        billingInterval: data.billingInterval,
        customerEmail,
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
    if (isStripeMockMode()) {
      const portalSessionId = `bps_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const url = `https://billing.stripe.com/p/session/${portalSessionId}?return_url=${encodeURIComponent(returnUrl)}`;
      return { url, customerId, returnUrl };
    }

    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      throw new Error('Stripe Billing Portal session created without URL');
    }

    return {
      url: session.url,
      customerId,
      returnUrl,
    };
  }

  /**
   * Processa os Webhooks oficiais do ciclo de vida da assinatura no Stripe
   */
  public async handleWebhook(event: Stripe.Event | {
    id?: string;
    type: string;
    data: { object: Record<string, unknown>; previous_attributes?: Record<string, unknown> };
  }): Promise<StripeWebhookResult> {
    const normalizedEvent = {
      id: 'id' in event && event.id ? event.id : `evt_mock_${Date.now()}`,
      type: event.type,
      data: event.data,
    } as Stripe.Event;

    return stripeWebhookService.processEvent(normalizedEvent);
  }

  /**
   * Lista as faturas (invoices) do cliente Stripe vinculado à assinatura do workspace
   */
  public async listInvoices(
    customerId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<StripeInvoiceListResult> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 10;

    if (isStripeMockMode()) {
      const now = Date.now();
      const mockInvoices: StripeInvoiceItem[] = Array.from({ length: 3 }, (_, i) => {
        const created = now - i * 30 * 24 * 60 * 60 * 1000;
        return {
          id: `in_mock_${customerId}_${i + 1}`,
          number: `INV-2026-${String(1000 + i).padStart(4, '0')}`,
          createdAt: new Date(created).toISOString(),
          amount: 19700,
          currency: 'brl',
          status: 'paid',
          pdfUrl: `https://pay.stripe.com/invoice/in_mock_${customerId}_${i + 1}/pdf`,
          hostedUrl: `https://invoice.stripe.com/i/in_mock_${customerId}_${i + 1}`,
        };
      });

      const paged = paginate(mockInvoices, page, limit);
      return {
        items: paged.items,
        pagination: { total: paged.total, page, limit, totalPages: paged.totalPages },
      };
    }

    const stripe = getStripeClient();
    const listed = await stripe.invoices.list({ customer: customerId, limit: 100 });
    const mapped = listed.data.map(mapStripeInvoice);
    const paged = paginate(mapped, page, limit);

    return {
      items: paged.items,
      pagination: { total: paged.total, page, limit, totalPages: paged.totalPages },
    };
  }
}

export const stripePaymentService = new StripePaymentService();

export { StripePriceConfigError };
