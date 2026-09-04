import { z } from 'zod';
import { PlanType, BillingInterval } from '../types/checkout.js';
import { legalAcceptanceItemSchema } from './legal.js';

export const portalSessionSchema = z.object({
  returnUrl: z.string().url().optional()
});

export const createStripeBaseSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE'] as const),
  billingInterval: z.enum(['MONTHLY', 'YEARLY'] as const),
  customer: z.object({
    dealershipName: z.string().min(2),
    document: z.string().min(6),
    email: z.string().email(),
    phone: z.string().min(6)
  })
});

export const createStripePixSchema = createStripeBaseSchema;
export const createStripeCardSchema = createStripeBaseSchema.extend({
  cardToken: z.string().optional(),
  paymentMethodId: z.string().optional(),
  installments: z.number().int().min(1).max(12).optional()
});

export const createStripeCheckoutSessionSchema = createStripeBaseSchema.extend({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const createWorkspaceStripeCheckoutSessionSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE'] as const),
  billingInterval: z.enum(['MONTHLY', 'YEARLY'] as const),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  legalAcceptances: z.array(legalAcceptanceItemSchema).min(1, { message: 'legalAcceptances é obrigatório' }),
});

export const checkoutSessionParamsSchema = z.object({
  sessionId: z.string().min(1, { message: 'sessionId é obrigatório' }),
});

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListInvoicesQueryDTO = z.infer<typeof listInvoicesQuerySchema>;

export type CreateStripePixDTO = z.infer<typeof createStripePixSchema>;
export type CreateStripeCardDTO = z.infer<typeof createStripeCardSchema>;
export type CreateStripeCheckoutSessionDTO = z.infer<typeof createStripeCheckoutSessionSchema>;
export type CreateWorkspaceStripeCheckoutSessionDTO = z.infer<typeof createWorkspaceStripeCheckoutSessionSchema>;
