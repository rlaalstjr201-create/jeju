import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';

function makeDeps(): AppDependencies {
  return {
    createTripUseCase: { execute: vi.fn() } as never,
    getRecommendationsUseCase: { execute: vi.fn() } as never,
    updateShortlistUseCase: { execute: vi.fn() } as never,
    composeDayPlanUseCase: { execute: vi.fn() } as never,
    editDayPlanUseCase: { execute: vi.fn() } as never,
    discoverCandidatesUseCase: {
      execute: vi.fn().mockResolvedValue({ discovered: 0, skippedDuplicates: 0 }),
    } as never,
    listCandidatesUseCase: { execute: vi.fn().mockResolvedValue([]) } as never,
    enrichCandidateUseCase: { execute: vi.fn() } as never,
    approveCandidateUseCase: {
      execute: vi.fn().mockResolvedValue({ spotId: 'spot-1' }),
    } as never,
    rejectCandidateUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as never,
    adjustCalibrationUseCase: { execute: vi.fn() } as never,
  };
}

describe('Admin curation routes — auth (C1) + validation (M1)', () => {
  // -------------------------------------------------------------------------
  // C1: Curator auth required on all admin routes
  // -------------------------------------------------------------------------

  it('(C1) POST /discover — 401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/discover',
      headers: { authorization: 'Bearer regular-user' },
      body: {},
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(C1) GET /candidates — 401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/admin/curation/candidates',
      headers: { authorization: 'Bearer regular-user' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(C1) POST /approve — 401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer regular-user' },
      body: { curationScore: 80 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(C1) POST /reject — 401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/reject',
      headers: { authorization: 'Bearer regular-user' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(C1) dev-curator-* prefix is accepted', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 80 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(201);
  });

  // -------------------------------------------------------------------------
  // M1: ValidationError → 400 for out-of-range curationScore
  // -------------------------------------------------------------------------

  it('(M1) curationScore=150 → 400 VALIDATION_ERROR', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 150 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('(M1) curationScore=0 → 400 VALIDATION_ERROR', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 0 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
  });

  it('(M1) curationScore=1.5 (non-integer) → 400 VALIDATION_ERROR', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 1.5 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
  });
});
