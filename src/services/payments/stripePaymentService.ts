import {
  CreateStripePixRequest,
  CreateStripeCardRequest,
  StripePixResponse,
  StripeCardResponse,
  PlanType,
  BillingInterval
} from '../../types/checkout.js';

export const PLAN_PRICING: Record<PlanType, { monthly: number; yearly: number; name: string }> = {
  STARTER: {
    monthly: 49000, // centavos BRL (R$ 490,00)
    yearly: 490000, // R$ 4.900,00
    name: 'Starter Catalog',
  },
  PRO: {
    monthly: 89000, // R$ 890,00
    yearly: 890000, // R$ 8.900,00
    name: 'Pro Automotive',
  },
  ENTERPRISE: {
    monthly: 149000, // R$ 1.490,00
    yearly: 1490000, // R$ 14.900,00
    name: 'Enterprise DAA',
  },
};

export class StripePaymentService {
  /**
   * Cria um PaymentIntent do Stripe com Pix para pagamento no Brasil
   */
  public async createPixPayment(data: CreateStripePixRequest): Promise<StripePixResponse> {
    const planInfo = PLAN_PRICING[data.plan];
    const amount = data.billingInterval === 'YEARLY' ? planInfo.yearly : planInfo.monthly;

    const paymentIntentId = `pi_stripe_pix_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutos

    // Simulação do payload EMV Copia e Cola do Pix gerado pelo Stripe
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
   * Processa Webhook oficial do Stripe
   */
  public async handleWebhook(event: { type: string; data: { object: Record<string, unknown> } }) {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log(`[Stripe Webhook] Pix aprovado com sucesso: ${paymentIntent.id}`);
        return { received: true, action: 'PROVISION_TENANT', status: 'ACTIVE' };
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log(`[Stripe Webhook] Assinatura de cartão aprovada: ${invoice.id}`);
        return { received: true, action: 'RENEW_SUBSCRIPTION', status: 'ACTIVE' };
      }
      default:
        return { received: true, action: 'IGNORED' };
    }
  }
}

export const stripePaymentService = new StripePaymentService();
