import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthUser } from '../auth/auth.middleware.js';
import { CreateLegalAcceptanceDTO, LegalDocumentSlugParams } from '../../schemas/legal.js';
import {
  LegalAcceptanceMismatchError,
  LegalWorkspaceForbiddenError,
  legalService,
} from './legal.service.js';

export async function listLegalDocumentsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const documents = await legalService.listCurrentDocuments();
  reply.status(200).send({ documents });
}

export async function getLegalDocumentHandler(
  request: FastifyRequest<{ Params: LegalDocumentSlugParams }>,
  reply: FastifyReply,
): Promise<void> {
  const { slug } = request.params;
  const document = await legalService.getCurrentDocumentBySlug(slug);

  if (!document) {
    reply.status(404).send({
      type: 'https://autocatalogo.com.br/errors/not-found',
      title: 'Documento Jurídico Não Encontrado',
      status: 404,
      detail: `Nenhum documento vigente encontrado para o slug "${slug}".`,
      instance: request.url,
    });
    return;
  }

  reply.status(200).send({ document });
}

export async function createLegalAcceptanceHandler(
  request: FastifyRequest<{ Body: CreateLegalAcceptanceDTO }>,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as AuthUser;

  try {
    const { acceptance, created } = await legalService.recordAcceptance(user, request.body);
    reply.status(created ? 201 : 200).send({ acceptance });
  } catch (err) {
    if (err instanceof LegalAcceptanceMismatchError) {
      reply.status(422).send({
        type: 'https://autocatalogo.com.br/errors/validation-error',
        title: 'Validation Error',
        status: 422,
        detail: err.message,
        instance: request.url,
      });
      return;
    }

    if (err instanceof LegalWorkspaceForbiddenError) {
      reply.status(403).send({
        type: 'https://autocatalogo.com.br/errors/forbidden',
        title: 'Acesso Proibido',
        status: 403,
        detail: err.message,
        instance: request.url,
      });
      return;
    }

    throw err;
  }
}
