import { FastifyRequest, FastifyReply } from 'fastify';
import { stripePaymentService } from '../../services/payments/stripePaymentService.js';
import { prisma } from '../../lib/prisma.js';
import { formatWorkspaceBilling } from './billing-details.js';
import type { ListInvoicesQueryDTO } from '../../schemas/billing.js';

interface BillingInvoicesParams {
  workspaceId: string;
}

export async function createStripePortalSessionHandler(
  request: FastifyRequest<{ Body: { returnUrl?: string } }>,
  reply: FastifyReply
) {
  const user = request.user;
  if (!user || !user.workspaceId) {
    return reply.status(401).send({
      type: 'https://autocatalogo.com.br/errors/unauthorized',
      title: 'Não Autorizado',
      status: 401,
      detail: 'Autenticação necessária para acessar o portal de faturamento.',
    });
  }

  const returnUrl = request.body?.returnUrl || 'https://app.autocatalogo.com.br/settings/billing';

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId: user.workspaceId },
  });

  if (!sub?.stripeCustomerId) {
    return reply.status(404).send({
      type: 'https://autocatalogo.com.br/errors/subscription-not-found',
      title: 'Assinatura não encontrada',
      status: 404,
      detail: 'Nenhuma assinatura Stripe vinculada a este workspace.',
    });
  }

  const portalSession = await stripePaymentService.createPortalSession(sub.stripeCustomerId, returnUrl);
  return reply.send(portalSession);
}

export async function getWorkspaceBillingDetailsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId } = request.params;

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
  });

  return reply.send(formatWorkspaceBilling(workspaceId, sub));
}

export async function getWorkspaceBillingInvoicesHandler(
  request: FastifyRequest<{ Params: BillingInvoicesParams; Querystring: ListInvoicesQueryDTO }>,
  reply: FastifyReply
) {
  const { workspaceId } = request.params;
  const { page, limit } = request.query;

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
  });

  if (!sub?.stripeCustomerId) {
    return reply.send({
      items: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    });
  }

  const result = await stripePaymentService.listInvoices(sub.stripeCustomerId, { page, limit });
  return reply.send(result);
}
