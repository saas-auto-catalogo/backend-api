import { FastifyReply, FastifyRequest } from 'fastify';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';
const REFRESH_TOKEN_PATH = '/api/v1/auth';
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function setRefreshTokenCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: REFRESH_TOKEN_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_TOKEN_COOKIE, {
    path: REFRESH_TOKEN_PATH,
  });
}

export function getRefreshTokenFromRequest(request: FastifyRequest): string | undefined {
  const cookieToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  const body = request.body as { refreshToken?: string } | undefined;
  return body?.refreshToken;
}
