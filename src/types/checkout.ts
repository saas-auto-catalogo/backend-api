import type { LegalAcceptanceItem } from '../schemas/legal.js';

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

export interface CreateStripeCheckoutSessionRequest {
  plan: PlanType;
  billingInterval: BillingInterval;
  customer: CheckoutCustomerData;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateWorkspaceStripeCheckoutSessionRequest {
  plan: PlanType;
  billingInterval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  legalAcceptances: LegalAcceptanceItem[];
}

export interface CreateWorkspaceStripeCheckoutSessionParams {
  workspaceId: string;
  customerEmail: string;
  data: CreateWorkspaceStripeCheckoutSessionRequest;
}

export interface StripeCheckoutSessionResponse {
  sessionId: string;
  url: string;
}
