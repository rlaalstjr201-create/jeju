import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { requireCuratorRole, mapErrorToReply } from './_shared.js';

export function registerAdminPipelineRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // POST /api/v1/admin/curation/pipeline/run
  fastify.post('/api/v1/admin/curation/pipeline/run', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const result = await deps.runDiscoveryPipelineUseCase.execute();
      return reply.status(202).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // GET /api/v1/admin/curation/candidates/:id
  fastify.get('/api/v1/admin/curation/candidates/:id', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const params = req.params as { id: string };
      const candidate = await deps.getCandidateByIdUseCase.execute(params.id);
      if (!candidate) {
        return reply.status(404).send({ code: 'CANDIDATE_NOT_FOUND', message: `Candidate ${params.id} not found` });
      }
      return reply.status(200).send(candidate);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
