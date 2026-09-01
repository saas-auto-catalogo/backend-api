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

  // Obter customerId associado ao workspace se existir
  let customerId = `cus_mock_${user.workspaceId.substring(0, 8)}`;
  try {
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId: user.workspaceId }
    });
    if (sub) {
      customerId = `cus_${user.workspaceId}`;
    }
  } catch {
    // mock fallback
  }

  const portalSession = await stripePaymentService.createPortalSession(customerId, returnUrl);

  return reply.send(portalSession);
}

export async function getWorkspaceBillingDetailsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId } = request.params;

  let planTier: PlanType = 'PRO';
  let status = 'ACTIVE';
  let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  let cancelAtPeriodEnd = false;

  try {
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId }
    });
    if (sub) {
      planTier = sub.planTier as PlanType;
      status = sub.status;
      currentPeriodEnd = sub.currentPeriodEnd.toISOString();
    }
  } catch {
    // mock fallback
  }

  const planLimits = PLAN_LIMITS[planTier] || PLAN_LIMITS.PRO;

  return reply.send({
    workspaceId,
    planTier,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    limits: planLimits,
  });
}
