import { FastifyRequest, FastifyReply } from 'fastify';
import { stripePaymentService, StripePriceConfigError } from '../../services/payments/stripePaymentService.js';
import {
  CreateStripePixRequest,
  CreateStripeCardRequest,
  CreateStripeCheckoutSessionRequest,
} from '../../types/checkout.js';

export async function createStripePixHandler(
  request: FastifyRequest<{ Body: CreateStripePixRequest }>,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body;

  if (!payload?.plan || !payload?.customer?.dealershipName || !payload?.customer?.email) {
    reply.status(400).send({
      error: 'MISSING_FIELDS',
      message: 'Os campos plan, dealershipName e email são obrigatórios.',
    });
    return;
  }

  const pixResponse = await stripePaymentService.createPixPayment(payload);
  reply.status(201).send(pixResponse);
}

export async function createStripeCardHandler(
  request: FastifyRequest<{ Body: CreateStripeCardRequest }>,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body;

  if (!payload?.plan || !payload?.customer?.dealershipName || !payload?.customer?.email) {
    reply.status(400).send({
      error: 'MISSING_FIELDS',
      message: 'Os campos plan, dealershipName e email são obrigatórios.',
    });
    return;
  }

  const cardResponse = await stripePaymentService.createCardSubscription(payload);
  reply.status(201).send(cardResponse);
}

export async function createStripeCheckoutSessionHandler(
  request: FastifyRequest<{ Body: CreateStripeCheckoutSessionRequest }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const session = await stripePaymentService.createCheckoutSession(request.body);
    reply.status(201).send(session);
  } catch (error) {
    if (error instanceof StripePriceConfigError) {
      reply.status(503).send({
        type: 'https://autocatalogo.com.br/errors/stripe-config-error',
        title: 'Stripe Configuration Error',
        status: 503,
        detail: error.message,
      });
      return;
    }
    throw error;
  }
}

export async function stripeWebhookHandler(
  request: FastifyRequest<{ Body: { type: string; data: { object: Record<string, unknown> } } }>,
  reply: FastifyReply
): Promise<void> {
  const result = await stripePaymentService.handleWebhook(request.body);
  reply.status(200).send(result);
}
