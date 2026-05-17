import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerTripsRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // POST /api/v1/trips
  fastify.post('/api/v1/trips', async (req, reply) => {
    const accessToken = extractToken(req);
    const body = req.body as { freeText?: unknown };
    const freeText = typeof body.freeText === 'string' ? body.freeText : '';

    try {
      const result = await deps.createTripUseCase.execute({ accessToken, freeText });
      return reply.status(201).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // POST /api/v1/trips/:tripId/dayplan
  fastify.post('/api/v1/trips/:tripId/dayplan', async (req, reply) => {
    const accessToken = extractToken(req);
    const params = req.params as { tripId: string };
    const tripId = params.tripId;

    try {
      const result = await deps.composeDayPlanUseCase.execute({ accessToken, tripId });
      return reply.status(201).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
