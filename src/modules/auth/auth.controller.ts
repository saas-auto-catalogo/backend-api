import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service.js';
import {
  LoginDTO,
  RefreshTokenDTO,
  ForgotPasswordDTO,
  ResetPasswordDTO,
  LogoutDTO,
} from '../../schemas/auth.js';
import { AuthUser } from './auth.middleware.js';

export async function loginHandler(
  request: FastifyRequest<{ Body: LoginDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { email, password } = request.body;
  const ipAddress = request.ip;
  const userAgent = request.headers['user-agent'] || '';

  const result = await authService.login(request.server, email, password, ipAddress, userAgent);

  reply.status(200).send({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
    user: result.user,
  });
}

export async function refreshHandler(
  request: FastifyRequest<{ Body: RefreshTokenDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { refreshToken } = request.body;

  const result = await authService.refresh(request.server, refreshToken);

  reply.status(200).send({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: 'Bearer',
  });
}

export async function logoutHandler(
  request: FastifyRequest<{ Body: LogoutDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { refreshToken } = request.body;

  await authService.logout(refreshToken);

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
