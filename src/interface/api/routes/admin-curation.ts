import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { requireCuratorRole, mapErrorToReply, ValidationError } from './_shared.js';

function validateCurationScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 100) {
    throw new ValidationError('curationScore must be an integer between 1 and 100');
  }
  return score;
}

function validateLimit(limit: unknown): number {
  const n = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    throw new ValidationError('limit must be between 1 and 100');
  }
  return Math.floor(n);
}

export function registerAdminCurationRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // POST /api/v1/admin/curation/discover
  fastify.post('/api/v1/admin/curation/discover', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const body = req.body as {
        region?: string;
        category?: string;
        limit?: number;
      };

      const executeInput: Parameters<typeof deps.discoverCandidatesUseCase.execute>[0] = {};
      if (body.region !== undefined) {
        executeInput.region = body.region as import('../../../domain/shared/Region.js').Region;
      }
      if (body.category !== undefined) {
        executeInput.category = body.category;
      }
      if (body.limit !== undefined) {
        executeInput.limit = validateLimit(body.limit);
      }
      const result = await deps.discoverCandidatesUseCase.execute(executeInput);
      return reply.status(202).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // GET /api/v1/admin/curation/candidates
  fastify.get('/api/v1/admin/curation/candidates', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const query = req.query as {
        status?: string;
        limit?: string;
        offset?: string;
      };

      const status = (query.status ?? 'pending') as 'pending' | 'approved' | 'rejected';
      const limit = query.limit !== undefined ? parseInt(query.limit, 10) : 20;
      const offset = query.offset !== undefined ? parseInt(query.offset, 10) : 0;

      const candidates = await deps.listCandidatesUseCase.execute({ status, limit, offset });
      return reply.status(200).send({ candidates, total: candidates.length });
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // POST /api/v1/admin/curation/candidates/:id/enrich
  fastify.post('/api/v1/admin/curation/candidates/:id/enrich', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const params = req.params as { id: string };
      const result = await deps.enrichCandidateUseCase.execute({
        candidateId: params.id,
      });
      return reply.status(200).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // POST /api/v1/admin/curation/candidates/:id/approve
  fastify.post('/api/v1/admin/curation/candidates/:id/approve', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const params = req.params as { id: string };
      const body = req.body as {
        curationScore: number;
        curationComment?: string;
      };

      const curationScore = validateCurationScore(body.curationScore);

      const approveInput: Parameters<typeof deps.approveCandidateUseCase.execute>[0] = {
        candidateId: params.id,
        curationScore,
      };
      if (body.curationComment !== undefined) {
        approveInput.curationComment = body.curationComment;
      }
      const result = await deps.approveCandidateUseCase.execute(approveInput);
      return reply.status(201).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // POST /api/v1/admin/curation/candidates/:id/reject
  fastify.post('/api/v1/admin/curation/candidates/:id/reject', async (req, reply) => {
    try {
      requireCuratorRole(req);
      const params = req.params as { id: string };
      await deps.rejectCandidateUseCase.execute({
        candidateId: params.id,
      });
      return reply.status(200).send({ status: 'rejected' });
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
