import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply, ValidationError } from './_shared.js';

export function registerCalibrationRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // PATCH /api/v1/trips/:tripId/calibration
  fastify.patch('/api/v1/trips/:tripId/calibration', async (req, reply) => {
    try {
      const accessToken = extractToken(req);
      const params = req.params as { tripId: string };
      const body = req.body as { curatedRatio: unknown };

      const ratio = body.curatedRatio;
      if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new ValidationError('curatedRatio must be a number between 0.0 and 1.0');
      }

      const result = await deps.adjustCalibrationUseCase.execute({
        accessToken,
        tripId: params.tripId,
        curatedRatio: ratio,
      });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
