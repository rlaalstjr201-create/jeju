import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerRecommendationsRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // GET /api/v1/trips/:tripId/recommendations?limit=12&offset=0
  fastify.get('/api/v1/trips/:tripId/recommendations', async (req, reply) => {
    const accessToken = extractToken(req);
    const params = req.params as { tripId: string };
    const query = req.query as { limit?: string; offset?: string };

    const limit = query.limit !== undefined ? parseInt(query.limit, 10) : 12;
    const offset = query.offset !== undefined ? parseInt(query.offset, 10) : 0;

    try {
      const result = await deps.getRecommendationsUseCase.execute({
        accessToken,
        tripId: params.tripId,
        limit,
        offset,
      });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
