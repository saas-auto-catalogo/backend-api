import { FastifyRequest, FastifyReply } from 'fastify';
import { stripePaymentService } from '../../services/payments/stripePaymentService.js';
import { CreateStripePixRequest, CreateStripeCardRequest } from '../../types/checkout.js';

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

export async function stripeWebhookHandler(
  request: FastifyRequest<{ Body: { type: string; data: { object: Record<string, unknown> } } }>,
  reply: FastifyReply
): Promise<void> {
  const result = await stripePaymentService.handleWebhook(request.body);
  reply.status(200).send(result);
}
