import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Subscription } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { redisClient } from '../../infra/redis/redis-client.js';
import { emailService } from '../../services/email/index.js';
import { AuthUser } from './auth.middleware.js';
import { subscriptionService } from '../billing/subscription.service.js';
import { formatWorkspaceBilling, WorkspaceBillingDetails } from '../billing/billing-details.js';

const BCRYPT_COST = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;
const RESET_TOKEN_TTL_SECONDS = 3600;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
    workspaceId: string | null;
    dealershipId: string | null;
    role: string | null;
  };
  billing?: WorkspaceBillingDetails;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

export interface MeResult {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    role: string;
  }>;
  createdAt: Date;
}

export interface UpdateOnboardingInput {
  onboardingStep?: number;
  onboardingCompleted?: boolean;
}

export interface UpdateOnboardingContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateMeInput {
  name?: string;
  avatarUrl?: string | null;
}

export class AuthService {
  async login(
    server: FastifyInstance,
    email: string,
    password: string,
    ipAddress?: string,
    userAgentStr?: string,
  ): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          include: { workspace: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw createAuthError('Credenciais invalidas. Verifique email e senha.', 401);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw createAuthError(
        `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${minutesLeft} minuto(s).`,
        423,
      );
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const updateData: any = { failedLoginAttempts: newFailedAttempts };

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      const remaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;
      if (remaining > 0) {
        throw createAuthError(
          `Credenciais invalidas. Voce tem mais ${remaining} tentativa(s) antes do bloqueio.`,
          401,
        );
      } else {
        throw createAuthError(
          `Conta bloqueada por ${LOCK_DURATION_MINUTES} minutos apos ${MAX_FAILED_ATTEMPTS} tentativas incorretas.`,
          423,
        );
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const membership = user.memberships[0] || null;
    const workspaceId = membership?.workspaceId || null;
    const billing = await this.loadBilling(workspaceId);

    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      workspaceId: membership?.workspaceId || undefined,
      dealershipId: undefined,
      role: membership?.role || undefined,
    };

    const accessToken = server.jwt.sign(
      { ...payload, sub: user.id } as AuthUser,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshTokenValue = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenValue,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgentStr?.substring(0, 500) || null,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
        workspaceId: membership?.workspaceId || null,
        dealershipId: null,
        role: membership?.role || null,
      },
      ...(billing ? { billing } : {}),
    };
  }

  async register(
    server: FastifyInstance,
    name: string,
    email: string,
    password: string,
    workspaceName: string,
    ipAddress?: string,
    userAgentStr?: string,
    options?: { plan?: 'trial' },
  ): Promise<LoginResult> {
    return this.registerNewWorkspace(
      server,
      name,
      email,
      password,
      workspaceName,
      ipAddress,
      userAgentStr,
      options,
    );
  }

  private async registerNewWorkspace(
    server: FastifyInstance,
    name: string,
    email: string,
    password: string,
    workspaceName: string,
    ipAddress?: string,
    userAgentStr?: string,
    options?: { plan?: 'trial' },
  ): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw createAuthError('Este email ja esta cadastrado. Faca login ou use outro email.', 409);
    }

    if (options?.plan === 'trial') {
      const trialConsumed = await subscriptionService.hasEmailConsumedTrial(normalizedEmail);
      if (trialConsumed) {
        throw createAuthError('Este email ja utilizou o periodo de teste gratuito.', 409);
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const slug = await generateUniqueSlug(workspaceName);

    const { user, membership, dealership, subscription } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: name.trim(),
          passwordHash,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName.trim(),
          slug,
          status: 'ACTIVE',
        },
      });

      const createdMembership = await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: createdUser.id,
          role: 'OWNER',
        },
        include: { workspace: true },
      });

      const createdDealership = await tx.dealership.create({
        data: {
          workspaceId: workspace.id,
          tradeName: workspaceName.trim(),
          email: normalizedEmail,
        },
      });

      const createdSubscription = options?.plan === 'trial'
        ? await subscriptionService.createTrialSubscription(workspace.id, tx)
        : null;

      return {
        user: createdUser,
        membership: createdMembership,
        dealership: createdDealership,
        subscription: createdSubscription,
      };
    });

    return this.issueAuthResponse(
      server,
      user,
      membership,
      dealership.id,
      ipAddress,
      userAgentStr,
      false,
      subscription,
    );
  }

  private async loadBilling(workspaceId: string | null | undefined): Promise<WorkspaceBillingDetails | undefined> {
    if (!workspaceId) {
      return undefined;
    }

    const sub = await prisma.subscription.findUnique({
      where: { workspaceId },
    });

    return formatWorkspaceBilling(workspaceId, sub);
  }

  private async issueAuthResponse(
    server: FastifyInstance,
    user: { id: string; email: string; name: string; avatarUrl: string | null; isSuperAdmin: boolean },
    membership: { workspaceId: string; role: string; workspace: { name: string } },
    dealershipId: string,
    ipAddress?: string,
    userAgentStr?: string,
    fromCheckout = false,
    subscription: Subscription | null = null,
  ): Promise<LoginResult> {
    void fromCheckout;
    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      workspaceId: membership.workspaceId,
      dealershipId,
      role: membership.role as AuthUser['role'],
    };

    const accessToken = server.jwt.sign(
      { ...payload, sub: user.id } as AuthUser,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshTokenValue = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenValue,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgentStr?.substring(0, 500) || null,
      },
    });

    const loginUrl = `${process.env.FRONTEND_URL || 'https://app.autocatalogo.com.br'}/login`;
    emailService.sendWelcomeEmail(user.email, {
      userName: user.name,
      workspaceName: membership.workspace.name,
      loginUrl,
    }).catch(() => {});

    const billing = subscription
      ? formatWorkspaceBilling(subscription.workspaceId, subscription)
      : await this.loadBilling(membership.workspaceId);

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isSuperAdmin: user.isSuperAdmin,
        workspaceId: membership.workspaceId,
        dealershipId,
        role: membership.role,
      },
      ...(billing ? { billing } : {}),
    };
  }

  async refresh(
    server: FastifyInstance,
    refreshToken: string,
  ): Promise<RefreshResult> {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            memberships: {
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!storedToken) {
      throw createAuthError('Refresh token invalido ou nao encontrado.', 401);
    }

    if (storedToken.revoked) {
      throw createAuthError('Refresh token ja foi revogado.', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true, revokedAt: new Date() },
      });
      throw createAuthError('Refresh token expirado. Faca login novamente.', 401);
    }

    const user = storedToken.user;
    const membership = user.memberships[0] || null;
    const payload: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      workspaceId: membership?.workspaceId || undefined,
      dealershipId: undefined,
      role: membership?.role || undefined,
    };

    const accessToken = server.jwt.sign(
      { ...payload, sub: user.id } as AuthUser,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    return {
      accessToken,
      expiresIn: 900,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken) {
      return;
    }

    if (!storedToken.revoked) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return;
    }

    const resetToken = randomUUID();
    const redisKey = `password-reset:${resetToken}`;

    await redisClient.set(redisKey, user.id, 'EX', RESET_TOKEN_TTL_SECONDS);

    const resetUrl = `${process.env.FRONTEND_URL || 'https://app.autocatalogo.com.br'}/reset-password?token=${resetToken}`;

    await emailService.sendPasswordResetEmail(user.email, {
      userName: user.name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const redisKey = `password-reset:${token}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) {
      throw createAuthError(
        'Token de reset invalido ou expirado. Solicite um novo link de redefinicao.',
        400,
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    await redisClient.del(redisKey);
  }

  async getMe(userId: string): Promise<MeResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { workspace: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw createAuthError('Usuario nao encontrado.', 404);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
      mfaEnabled: user.mfaEnabled,
      onboardingCompleted: user.onboardingCompleted,
      onboardingStep: user.onboardingStep,
      memberships: user.memberships.map((m) => ({
        workspaceId: m.workspaceId,
        workspaceName: m.workspace.name,
        role: m.role,
      })),
      createdAt: user.createdAt,
    };
  }

  async updateOnboarding(
    userId: string,
    data: UpdateOnboardingInput,
    ctx?: UpdateOnboardingContext,
  ): Promise<MeResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw createAuthError('Usuario nao encontrado.', 404);
    }

    if (user.onboardingCompleted && data.onboardingStep !== undefined) {
      throw createAuthError('Onboarding ja foi concluido.', 400);
    }

    const updateData: { onboardingStep?: number; onboardingCompleted?: boolean } = {};

    if (data.onboardingCompleted === true) {
      updateData.onboardingCompleted = true;
      updateData.onboardingStep = 4;
    } else if (data.onboardingStep !== undefined) {
      updateData.onboardingStep = data.onboardingStep;
    }

    const willComplete = data.onboardingCompleted === true && !user.onboardingCompleted;

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (willComplete) {
      await prisma.auditLog.create({
        data: {
          workspaceId: user.memberships[0]?.workspaceId ?? null,
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'ONBOARDING_COMPLETED',
          entityName: 'User',
          entityId: user.id,
          ipAddress: ctx?.ipAddress ?? null,
          userAgent: ctx?.userAgent?.substring(0, 500) ?? null,
          metadata: { finalStep: 4 },
        },
      });
    }

    return this.getMe(userId);
  }

  async updateMe(userId: string, data: UpdateMeInput): Promise<MeResult> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw createAuthError('Usuario nao encontrado.', 404);
    }

    const updateData: { name?: string; avatarUrl?: string | null } = {};

    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return this.getMe(userId);
  }
}

export function createAuthError(detail: string, status: number): Error & { problem: any; statusCode: number } {
  const typeMap: Record<number, string> = {
    400: 'bad-request',
    401: 'unauthorized',
    404: 'not-found',
    409: 'conflict',
    423: 'account-locked',
    429: 'rate-limited',
  };

  const titleMap: Record<number, string> = {
    400: 'Requisicao Invalida',
    401: 'Nao Autorizado',
    404: 'Nao Encontrado',
    409: 'Conflito',
    423: 'Conta Bloqueada',
    429: 'Limite de Requisicoes Excedido',
  };

  const err = new Error(detail) as any;
  err.statusCode = status;
  err.problem = {
    type: `https://autocatalogo.com.br/errors/${typeMap[status] || 'internal-error'}`,
    title: titleMap[status] || 'Erro',
    status,
    detail,
  };
  return err;
}

function slugifyWorkspaceName(workspaceName: string): string {
  return workspaceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 90) || 'workspace';
}

async function generateUniqueSlug(workspaceName: string): Promise<string> {
  const baseSlug = slugifyWorkspaceName(workspaceName);
  let candidate = baseSlug;
  let suffix = 2;

  while (await prisma.workspace.findUnique({ where: { slug: candidate } })) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return candidate;
}

export const authService = new AuthService();
export default authService;
