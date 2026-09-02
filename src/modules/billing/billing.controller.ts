import { FastifyRequest, FastifyReply } from 'fastify';
import { stripePaymentService } from '../../services/payments/stripePaymentService.js';
import { PLAN_LIMITS } from './plan-limits.js';
import { PlanType } from '../../types/checkout.js';
import { prisma } from '../../lib/prisma.js';

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

  if (!sub) {
    return reply.send({
      workspaceId,
      planTier: null,
      status: 'NONE',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: null,
    });
  }

  const planTier = sub.planTier as PlanType;
  const planLimits = PLAN_LIMITS[planTier] || PLAN_LIMITS.PRO;

  return reply.send({
    workspaceId,
    planTier,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    limits: planLimits,
  });
}
