import type { FastifyInstance } from 'fastify';
import { SPOT_CATEGORIES } from '@jeju/shared';
import type { AppDependencies } from '../AppDependencies.js';
import { mapErrorToReply, ValidationError } from './_shared.js';

const VALID_CATEGORIES = new Set<string>(SPOT_CATEGORIES);

export function registerSpotsRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  fastify.get('/api/v1/spots', async (req, reply) => {
    const query = req.query as { category?: string };
    const category = query['category'];

    try {
      if (category !== undefined && !VALID_CATEGORIES.has(category)) {
        throw new ValidationError(`Invalid category: ${category}`);
      }
      const result = await deps.listApprovedSpotsUseCase.execute(
        category !== undefined ? { category } : {},
      );
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
