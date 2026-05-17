import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { TripNotFoundError, ForbiddenError } from '../../../application/core-flow/GetRecommendationsUseCase.js';

function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

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
      if (err instanceof TripNotFoundError) {
        return reply.status(404).send({ code: 'TRIP_NOT_FOUND', message: err.message });
      }
      if (err instanceof ForbiddenError) {
        return reply.status(403).send({ code: 'FORBIDDEN', message: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
    }
  });
}
