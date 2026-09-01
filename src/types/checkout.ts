export type BillingInterval = 'MONTHLY' | 'YEARLY';
export type PlanType = 'STARTER' | 'PRO' | 'ENTERPRISE';

export interface CheckoutCustomerData {
  dealershipName: string;
  document: string; // CNPJ ou CPF
  email: string;
  phone: string;
}

export interface CreateStripePixRequest {
  plan: PlanType;
  billingInterval: BillingInterval;
  customer: CheckoutCustomerData;
}

export interface CreateStripeCardRequest {
  plan: PlanType;
  billingInterval: BillingInterval;
  customer: CheckoutCustomerData;
  cardToken?: string;
  paymentMethodId?: string;
  installments?: number;
}

export interface StripePixResponse {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  qrCodeUrl: string;
  qrCodeText: string;
  expiresAt: string;
  status: 'requires_action' | 'processing' | 'succeeded';
}

export interface StripeCardResponse {
  subscriptionId: string;
  customerId: string;
  status: 'active' | 'trialing' | 'incomplete';
  currentPeriodEnd: string;
  amount: number;
}
