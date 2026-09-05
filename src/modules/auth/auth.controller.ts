import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, createAuthError } from './auth.service.js';
import {
  LoginDTO,
  RegisterDTO,
  RegisterQueryDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
  UpdateOnboardingDTO,
  UpdateMeDTO,
} from '../../schemas/auth.js';
import { AuthUser } from './auth.middleware.js';
import { LegalAcceptanceMismatchError } from '../legal/legal.service.js';
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} from './auth.cookie.js';

export async function loginHandler(
  request: FastifyRequest<{ Body: LoginDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { email, password } = request.body;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] || '';

  const result = await authService.login(request.server, email, password, ipAddress, userAgent);

  setRefreshTokenCookie(reply, result.refreshToken);

  reply.status(200).send({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
    user: result.user,
    ...(result.billing ? { billing: result.billing } : {}),
  });
}

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterDTO; Querystring: RegisterQueryDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { name, email, password, workspaceName, legalAcceptances } = request.body;
  const { plan } = request.query;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] || '';

  try {
    const result = await authService.register(
      request.server,
      name,
      email,
      password,
      workspaceName,
      ipAddress,
      userAgent,
      plan === 'trial' ? { plan: 'trial' } : undefined,
      legalAcceptances,
    );

    setRefreshTokenCookie(reply, result.refreshToken);

    reply.status(201).send({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: 'Bearer',
      user: result.user,
      ...(result.billing ? { billing: result.billing } : {}),
    });
  } catch (err) {
    if (err instanceof LegalAcceptanceMismatchError) {
      reply.status(422).send({
        type: 'https://drivesync.me/errors/validation-error',
        title: 'Validation Error',
        status: 422,
        detail: err.message,
        instance: request.url,
      });
      return;
    }
    throw err;
  }
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const refreshToken = getRefreshTokenFromRequest(request);

  if (!refreshToken) {
    throw createAuthError('Refresh token ausente. Faca login novamente.', 401);
  }

  const result = await authService.refresh(request.server, refreshToken);

  reply.status(200).send({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
  });
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const refreshToken = getRefreshTokenFromRequest(request);

  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  clearRefreshTokenCookie(reply);

  reply.status(200).send({
    message: 'Logout realizado com sucesso. Refresh token revogado.',
  });
}

export async function forgotPasswordHandler(
  request: FastifyRequest<{ Body: ForgotPasswordDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { email } = request.body;

  await authService.forgotPassword(email);

  reply.status(200).send({
    message: 'Se o email estiver cadastrado, voce recebera um link de redefinicao de senha em breve.',
  });
}

export async function resetPasswordHandler(
  request: FastifyRequest<{ Body: ResetPasswordDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { token, newPassword } = request.body;

  await authService.resetPassword(token, newPassword);

  reply.status(200).send({
    message: 'Senha redefinida com sucesso. Faca login com sua nova senha.',
  });
}

export async function getMeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as AuthUser;

  const profile = await authService.getMe(user.id);

  reply.status(200).send({
    user: profile,
  });
}

export async function patchMeHandler(
  request: FastifyRequest<{ Body: UpdateMeDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as AuthUser;

  const profile = await authService.updateMe(user.id, request.body);

  reply.status(200).send({
    user: profile,
  });
}

export async function patchOnboardingHandler(
  request: FastifyRequest<{ Body: UpdateOnboardingDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as AuthUser;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] || '';

  const profile = await authService.updateOnboarding(user.id, request.body, {
    ipAddress,
    userAgent,
  });

  reply.status(200).send({
    user: profile,
  });
}
