import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { extractToken, mapErrorToReply } from './_shared.js';

export function registerAdminCurationRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  // POST /api/v1/admin/curation/discover
  fastify.post('/api/v1/admin/curation/discover', async (req, reply) => {
    const _token = extractToken(req);
    const body = req.body as {
      region?: string;
      category?: string;
      limit?: number;
    };

    try {
      const executeInput: Parameters<typeof deps.discoverCandidatesUseCase.execute>[0] = {};
      if (body.region !== undefined) {
        executeInput.region = body.region as import('../../../domain/shared/Region.js').Region;
      }
      if (body.category !== undefined) {
        executeInput.category = body.category;
      }
      if (body.limit !== undefined) {
        executeInput.limit = body.limit;
      }
      const result = await deps.discoverCandidatesUseCase.execute(executeInput);
      return reply.status(202).send(result);
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // GET /api/v1/admin/curation/candidates
  fastify.get('/api/v1/admin/curation/candidates', async (req, reply) => {
    const _token = extractToken(req);
    const query = req.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const status = (query.status ?? 'pending') as 'pending' | 'approved' | 'rejected';
    const limit = query.limit !== undefined ? parseInt(query.limit, 10) : 20;
    const offset = query.offset !== undefined ? parseInt(query.offset, 10) : 0;

    try {
      // Access candidateRepo directly through use case or via deps
      // We route through the enrichCandidateUseCase's repo — but we don't have direct access
      // Instead we expose a method on DiscoverCandidatesUseCase or use a listCandidates use case
      // For now use the pattern from the plan: direct repo access via deps
      const candidates = await deps.listCandidatesUseCase.execute({ status, limit, offset });
      return reply.status(200).send({ candidates, total: candidates.length });
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });

  // POST /api/v1/admin/curation/candidates/:id/enrich
  fastify.post('/api/v1/admin/curation/candidates/:id/enrich', async (req, reply) => {
    const _token = extractToken(req);
    const params = req.params as { id: string };

    try {
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
    const _token = extractToken(req);
    const params = req.params as { id: string };
    const body = req.body as {
      curationScore: number;
      curationComment?: string;
    };

    try {
      const approveInput: Parameters<typeof deps.approveCandidateUseCase.execute>[0] = {
        candidateId: params.id,
        curationScore: body.curationScore,
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
    const _token = extractToken(req);
    const params = req.params as { id: string };

    try {
      await deps.rejectCandidateUseCase.execute({
        candidateId: params.id,
      });
      return reply.status(200).send({ status: 'rejected' });
    } catch (err) {
      return mapErrorToReply(reply, err);
    }
  });
}
