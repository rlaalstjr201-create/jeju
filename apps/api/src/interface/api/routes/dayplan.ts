import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

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
      return mapErrorToReply(reply, err);
    }
  });
}
