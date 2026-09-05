import { FastifyRequest, FastifyReply } from 'fastify';
import { PlanFeatureKey, hasPlanFeature, isEntitledSubscriptionStatus } from './plan-limits.js';
import { PlanType } from '../../types/checkout.js';
import { prisma } from '../../lib/prisma.js';

export interface PlanContext {
  planTier: PlanType;
  status: string;
  isTrialActive: boolean;
}

/**
 * Middleware preHandler que valida se o plano ativo do workspace possui uma feature liberada
 */
export function requirePlanFeature(feature: PlanFeatureKey) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      reply.status(401).send({
        type: 'https://drivesync.me/errors/unauthorized',
        title: 'Não Autenticado',
        status: 401,
        detail: 'Autenticação necessária para validar plano de assinatura.',
        instance: request.url,
      });
      return;
    }

    // Super Admin tem bypass de feature gates
    if (user.isSuperAdmin || user.role === 'SUPER_ADMIN') {
      return;
    }

    const workspaceId = user.workspaceId;
    if (!workspaceId) {
      reply.status(403).send({
        type: 'https://drivesync.me/errors/no-workspace',
        title: 'Workspace Não Vinculado',
        status: 403,
        detail: 'Usuário não possui um workspace vinculado para verificar o plano.',
        instance: request.url,
      });
      return;
    }

    // Busca subscription do workspace no banco de dados
    let userPlan: PlanType = 'STARTER';
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { workspaceId },
      });

      if (subscription && isEntitledSubscriptionStatus(subscription.status)) {
        userPlan = subscription.planTier as PlanType;
      }
    } catch {
      // Fallback para STARTER em caso de erro de conexão com banco
      userPlan = 'STARTER';
    }

    if (!hasPlanFeature(userPlan, feature)) {
      reply.status(403).send({
        type: 'https://drivesync.me/errors/plan-feature-upgrade-required',
        title: 'Recurso Não Disponível no Seu Plano',
        status: 403,
        detail: `O recurso "${feature}" não está disponível no plano ${userPlan}. Faça o upgrade para o plano PRO ou ENTERPRISE para desbloquear este recurso.`,
        instance: request.url,
      });
    }
  };
}
