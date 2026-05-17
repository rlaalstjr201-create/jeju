import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { InvalidDateRangeError } from '../../../domain/trip/Trip.js';
import { TripNotFoundError, ForbiddenError } from '../../../application/core-flow/GetRecommendationsUseCase.js';
import { ShortlistEmptyError } from '../../../domain/schedule-composer/ScheduleComposer.js';

function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

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
      if (err instanceof InvalidDateRangeError) {
        return reply.status(400).send({ code: 'INVALID_DATE_RANGE', message: err.message });
      }
      if (err instanceof Error && (err.name === 'UnauthorizedError' || err.message.includes('Unauthorized') || err.message.includes('401'))) {
        return reply.status(401).send({ code: 'UNAUTHORIZED', message: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
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
      if (err instanceof ShortlistEmptyError) {
        return reply.status(400).send({ code: 'SHORTLIST_EMPTY' });
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
