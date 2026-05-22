import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { requireCuratorRole, mapErrorToReply } from './_shared.js';

export function registerAdminEmbeddingRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // POST /api/v1/admin/embedding/batch
  fastify.post('/api/v1/admin/embedding/batch', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const body = req.body as { spotIds?: string[] } | undefined;
      const result = await deps.embeddingBatcher.run(body?.spotIds);
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
