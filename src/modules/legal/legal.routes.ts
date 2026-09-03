import { FastifyInstance } from 'fastify';
import { authenticate } from '../auth/index.js';
import { validate } from '../../middleware/validation.js';
import {
  createLegalAcceptanceSchema,
  legalDocumentSlugParamsSchema,
} from '../../schemas/legal.js';
import {
  createLegalAcceptanceHandler,
  getLegalDocumentHandler,
  listLegalDocumentsHandler,
} from './legal.controller.js';

export async function registerLegalRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/v1/legal/documents', listLegalDocumentsHandler);

  server.get(
    '/api/v1/legal/documents/:slug',
    { preHandler: [validate(legalDocumentSlugParamsSchema, 'params')] },
    async (req, reply) => getLegalDocumentHandler(req as any, reply),
  );

  server.post(
    '/api/v1/legal/acceptances',
    { preHandler: [authenticate, validate(createLegalAcceptanceSchema, 'body')] },
    async (req, reply) => createLegalAcceptanceHandler(req as any, reply),
  );
}
