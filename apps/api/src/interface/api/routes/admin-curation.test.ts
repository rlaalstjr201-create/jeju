import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';

const ORIGINAL_NODE_ENV = process.env['NODE_ENV'];

afterEach(() => {
  delete process.env['CURATOR_SECRET'];
  if (ORIGINAL_NODE_ENV !== undefined) {
    process.env['NODE_ENV'] = ORIGINAL_NODE_ENV;
  } else {
    delete process.env['NODE_ENV'];
  }
});

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
    runDiscoveryPipelineUseCase: { execute: vi.fn() } as never,
    getCandidateByIdUseCase: { execute: vi.fn() } as never,
    patchCandidateCoordinatesUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as never,
    embeddingBatcher: { run: vi.fn(), runSingle: vi.fn() } as never,
    labelStudioBridge: { handleWebhook: vi.fn(), handleWebhookWithSignature: vi.fn() } as never,
    listApprovedSpotsUseCase: { execute: vi.fn().mockResolvedValue({ spots: [] }) } as never,
    getSpotByIdUseCase: { execute: vi.fn() } as never,
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

  // -------------------------------------------------------------------------
  // S8B-1: dev-curator-* gated to development mode only
  // -------------------------------------------------------------------------

  it('(S8B-1) dev-curator-* accepted when NODE_ENV=development', async () => {
    process.env['NODE_ENV'] = 'development';
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

  it('(S8B-1) dev-curator-* rejected when NODE_ENV=production', async () => {
    process.env['NODE_ENV'] = 'production';
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 80 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(S8B-1) dev-curator-* rejected when NODE_ENV=test (vitest default)', async () => {
    // NODE_ENV='test' is the default in vitest — no change needed, explicit for clarity
    process.env['NODE_ENV'] = 'test';
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 80 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('(S8B-1) dev-curator-* rejected when NODE_ENV is undefined', async () => {
    delete process.env['NODE_ENV'];
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer dev-curator-alice' },
      body: { curationScore: 80 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // M1: ValidationError → 400 for out-of-range curationScore
  // (uses CURATOR_SECRET for auth so NODE_ENV doesn't affect these)
  // -------------------------------------------------------------------------

  it('(M1) curationScore=150 → 400 VALIDATION_ERROR', async () => {
    process.env['CURATOR_SECRET'] = 'ci-secret';
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer ci-secret' },
      body: { curationScore: 150 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('(M1) curationScore=0 → 400 VALIDATION_ERROR', async () => {
    process.env['CURATOR_SECRET'] = 'ci-secret';
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer ci-secret' },
      body: { curationScore: 0 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
  });

  it('(M1) curationScore=1.5 (non-integer) → 400 VALIDATION_ERROR', async () => {
    process.env['CURATOR_SECRET'] = 'ci-secret';
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/candidates/c-1/approve',
      headers: { authorization: 'Bearer ci-secret' },
      body: { curationScore: 1.5 },
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
  });
});
