import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, createAuthError } from './auth.service.js';
import {
  LoginDTO,
  RegisterDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
  UpdateOnboardingDTO,
  UpdateMeDTO,
} from '../../schemas/auth.js';
import { AuthUser } from './auth.middleware.js';
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
  });
}

export async function registerHandler(
  request: FastifyRequest<{ Body: RegisterDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { name, email, password, workspaceName } = request.body;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] || '';

  const result = await authService.register(
    request.server,
    name,
    email,
    password,
    workspaceName,
    ipAddress,
    userAgent,
  );

  setRefreshTokenCookie(reply, result.refreshToken);

  reply.status(201).send({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
    user: result.user,
  });
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
