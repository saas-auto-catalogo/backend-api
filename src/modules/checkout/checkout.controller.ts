import { FastifyRequest, FastifyReply } from 'fastify';
import { stripePaymentService, StripePriceConfigError } from '../../services/payments/stripePaymentService.js';
import { constructStripeWebhookEvent } from '../../services/payments/stripe-client.js';
import {
  CreateStripePixRequest,
  CreateStripeCardRequest,
  CreateStripeCheckoutSessionRequest,
  CreateWorkspaceStripeCheckoutSessionRequest,
} from '../../types/checkout.js';
import { prisma } from '../../lib/prisma.js';

interface StripeWebhookRequest extends FastifyRequest {
  rawBody?: Buffer;
}

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
    reply
      .header('Deprecation', 'true')
      .header(
        'Link',
        '</api/v1/workspaces/{workspaceId}/checkout/stripe/session>; rel="successor-version"'
      )
      .status(201)
      .send(session);
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

export async function createWorkspaceStripeCheckoutSessionHandler(
  request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: CreateWorkspaceStripeCheckoutSessionRequest;
  }>,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;
  if (!user?.email) {
    reply.status(401).send({
      type: 'https://autocatalogo.com.br/errors/unauthorized',
      title: 'Não Autorizado',
      status: 401,
      detail: 'Autenticação necessária para iniciar checkout.',
    });
    return;
  }

  const { workspaceId } = request.params;
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
  });

  if (subscription?.status === 'ACTIVE') {
    reply.status(409).send({
      type: 'https://autocatalogo.com.br/errors/subscription-already-active',
      title: 'Assinatura já ativa',
      status: 409,
      detail: 'Este workspace já possui uma assinatura ativa. Use o portal de faturamento para gerenciar o plano.',
    });
    return;
  }

  try {
    const session = await stripePaymentService.createCheckoutSessionForWorkspace({
      workspaceId,
      customerEmail: user.email,
      data: request.body,
    });
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

export async function getStripeCheckoutSessionStatusHandler(
  _request: FastifyRequest<{ Params: { sessionId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  reply.status(410).send({
    type: 'https://autocatalogo.com.br/errors/checkout-session-status-deprecated',
    title: 'Endpoint descontinuado',
    status: 410,
    detail: 'Use GET /workspaces/:id/billing após login para verificar assinatura.',
  });
}

export async function stripeWebhookHandler(
  request: StripeWebhookRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const signature = request.headers['stripe-signature'] as string | undefined;
    const event = constructStripeWebhookEvent(rawBody, signature);
    const result = await stripePaymentService.handleWebhook(event);
    reply.status(200).send(result);
  } catch (error) {
    reply.status(400).send({
      type: 'https://autocatalogo.com.br/errors/stripe-webhook-invalid',
      title: 'Invalid Stripe Webhook',
      status: 400,
      detail: error instanceof Error ? error.message : 'Invalid webhook payload',
    });
  }
}
