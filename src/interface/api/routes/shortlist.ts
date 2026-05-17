import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerShortlistRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // PATCH /api/v1/shortlist
  fastify.patch('/api/v1/shortlist', async (req, reply) => {
    const accessToken = extractToken(req);
    const body = req.body as { spotId?: unknown; action?: unknown };
    const spotId = typeof body.spotId === 'string' ? body.spotId : '';
    const action = body.action === 'add' || body.action === 'remove' ? body.action : 'add';

    try {
      const result = await deps.updateShortlistUseCase.execute({ accessToken, spotId, action });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
