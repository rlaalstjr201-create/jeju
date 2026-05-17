import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { SpotNotFoundError } from '../../../application/core-flow/UpdateShortlistUseCase.js';

function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

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
      if (err instanceof SpotNotFoundError) {
        return reply.status(404).send({ code: 'SPOT_NOT_FOUND', message: err.message });
      }
      fastify.log.error(err);
      return reply.status(500).send({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
    }
  });
}
