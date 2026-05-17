import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerCalibrationRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // PATCH /api/v1/trips/:tripId/calibration
  fastify.patch('/api/v1/trips/:tripId/calibration', async (req, reply) => {
    const accessToken = extractToken(req);
    const params = req.params as { tripId: string };
    const body = req.body as { curatedRatio: number };

    try {
      const result = await deps.adjustCalibrationUseCase.execute({
        accessToken,
        tripId: params.tripId,
        curatedRatio: body.curatedRatio,
      });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
