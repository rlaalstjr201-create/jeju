import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { SpotNotFoundError } from '../../../application/core-flow/UpdateShortlistUseCase.js';
import { DayNotFoundError } from '../../../application/core-flow/EditDayPlanUseCase.js';
import { TripNotFoundError, ForbiddenError } from '../../../application/core-flow/GetRecommendationsUseCase.js';

function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

export function registerDayPlanRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // PATCH /api/v1/trips/:tripId/dayplan/days/:dayIndex/spots
  fastify.patch('/api/v1/trips/:tripId/dayplan/days/:dayIndex/spots', async (req, reply) => {
    const accessToken = extractToken(req);
    const params = req.params as { tripId: string; dayIndex: string };
    const body = req.body as { spotId?: unknown; action?: unknown };

    const tripId = params.tripId;
    const dayIndex = parseInt(params.dayIndex, 10);
    const spotId = typeof body.spotId === 'string' ? body.spotId : '';
    const action = body.action === 'pin' || body.action === 'unpin' ? body.action : 'pin';

    try {
      const result = await deps.editDayPlanUseCase.execute({
        accessToken,
        tripId,
        dayIndex,
        spotId,
        action,
      });
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof SpotNotFoundError) {
        return reply.status(404).send({ code: 'SPOT_NOT_FOUND', message: err.message });
      }
      if (err instanceof DayNotFoundError) {
        return reply.status(404).send({ code: 'DAY_NOT_FOUND', message: err.message });
      }
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
