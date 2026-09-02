import { FastifyRequest, FastifyReply } from 'fastify';
import { profileService } from './profile.service.js';
import { UpdateWorkspaceProfileDTO } from '../../schemas/profile.js';
import { AuthUser } from '../auth/auth.middleware.js';

export async function getWorkspaceProfileHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const profile = await profileService.getWorkspaceProfile(workspaceId);

  reply.status(200).send(profile);
}

export async function patchWorkspaceProfileHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Body: UpdateWorkspaceProfileDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const { workspaceId } = request.params;
  const user = request.user as AuthUser;

  const profile = await profileService.updateWorkspaceProfile(workspaceId, request.body, {
    actorUserId: user.id,
    actorEmail: user.email,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] || '',
  });

  reply.status(200).send(profile);
}
