import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerRecommendationsRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // GET /api/v1/trips/:tripId/recommendations
  fastify.get('/api/v1/trips/:tripId/recommendations', async (req, reply) => {
    const accessToken = extractToken(req);
    const params = req.params as { tripId: string };

    try {
      const result = await deps.getRecommendationsUseCase.execute({
        accessToken,
        tripId: params.tripId,
      });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
