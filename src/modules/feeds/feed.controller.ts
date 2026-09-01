import { FastifyRequest, FastifyReply } from 'fastify';
import { feedService, CreateFeedDTO, UpdateFeedDTO, FeedNotFoundError, SyncJobNotFoundError } from './feed.service.js';
import { feedUrlValidationService } from './feed-url-validation.service.js';
import { ValidateFeedUrlBody } from '../../schemas/feeds.js';

export async function listFeedsHandler(
  request: FastifyRequest<{ Params: { workspaceId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId } = request.params;
  const feeds = await feedService.listFeeds(workspaceId);
  return reply.send({ feeds });
}

export async function getFeedByIdHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId } = request.params;
  const feed = await feedService.getFeedById(workspaceId, feedId);

  if (!feed) {
    return reply.status(404).send({
      type: 'https://autocatalogo.com.br/errors/not-found',
      title: 'Feed Não Encontrado',
      status: 404,
      detail: `O feed com identificador "${feedId}" não foi encontrado.`,
    });
  }

  return reply.send({ feed });
}

export async function createFeedHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Body: CreateFeedDTO }>,
  reply: FastifyReply
) {
  const { workspaceId } = request.params;
  const body = request.body;

  if (!body.sourceType || !body.feedUrl) {
    return reply.status(400).send({
      type: 'https://autocatalogo.com.br/errors/bad-request',
      title: 'Dados Incompletos',
      status: 400,
      detail: 'Os campos "sourceType" e "feedUrl" são obrigatórios.',
    });
  }

  const newFeed = await feedService.createFeed(workspaceId, body);
  return reply.status(201).send({ feed: newFeed });
}

export async function updateFeedHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string }; Body: UpdateFeedDTO }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId } = request.params;
  const body = request.body;

  try {
    const updatedFeed = await feedService.updateFeed(workspaceId, feedId, body);
    return reply.send({ feed: updatedFeed });
  } catch (err) {
    if (err instanceof FeedNotFoundError) {
      return reply.status(404).send({
        type: 'https://autocatalogo.com.br/errors/not-found',
        title: 'Feed Não Encontrado',
        status: 404,
        detail: err.message,
      });
    }
    throw err;
  }
}

export async function deleteFeedHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId } = request.params;

  try {
    const result = await feedService.deleteFeed(workspaceId, feedId);
    return reply.send(result);
  } catch (err) {
    if (err instanceof FeedNotFoundError) {
      return reply.status(404).send({
        type: 'https://autocatalogo.com.br/errors/not-found',
        title: 'Feed Não Encontrado',
        status: 404,
        detail: err.message,
      });
    }
    throw err;
  }
}

export async function triggerFeedSyncHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId } = request.params;
  const userId = request.user?.id;

  try {
    const syncResult = await feedService.triggerSync(workspaceId, feedId, userId);
    return reply.status(202).send(syncResult);
  } catch (err) {
    if (err instanceof FeedNotFoundError) {
      return reply.status(404).send({
        type: 'https://autocatalogo.com.br/errors/not-found',
        title: 'Feed Não Encontrado',
        status: 404,
        detail: err.message,
      });
    }
    throw err;
  }
}

export async function getFeedSyncJobStatusHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string; jobId: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId, jobId } = request.params;

  try {
    const status = await feedService.getSyncJobStatus(workspaceId, feedId, jobId);
    return reply.send(status);
  } catch (err) {
    if (err instanceof SyncJobNotFoundError) {
      return reply.status(404).send({
        type: 'https://autocatalogo.com.br/errors/not-found',
        title: 'Job de Sincronização Não Encontrado',
        status: 404,
        detail: err.message,
      });
    }
    throw err;
  }
}

export async function getFeedHistoryHandler(
  request: FastifyRequest<{ Params: { workspaceId: string; feedId: string }; Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  const { workspaceId, feedId } = request.params;
  const limit = Number(request.query?.limit) || 30;

  const history = await feedService.getFeedHistory(workspaceId, feedId, limit);
  return reply.send({ history });
}

export async function validateFeedUrlHandler(
  request: FastifyRequest<{ Params: { workspaceId: string }; Body: ValidateFeedUrlBody }>,
  reply: FastifyReply
) {
  const { url } = request.body;
  const result = await feedUrlValidationService.validate(url);
  return reply.send(result);
}
