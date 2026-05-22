import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';
import type { DiscoveryPipelineResult } from '../../../application/curation/RunDiscoveryPipelineUseCase.js';
import type { CurationCandidate } from '../../../domain/curation/CurationCandidate.js';

const PIPELINE_RESULT: DiscoveryPipelineResult = {
  visitjejuSaved: 10,
  visitjejuSkipped: 2,
  naverSaved: 5,
  naverDeduplicated: 1,
  naverDroppedUnidentifiable: 3,
  naverSnippetsTotal: 0,
  naverKakaoMatched: 0,
  naverKakaoUnmatched: 0,
  naverLocalFallbackUsed: 0,
  parentSpotFallbackUsed: 0,
};

const CANDIDATE: CurationCandidate = {
  id: 'cand-001',
  kakaoPlaceId: null,
  visitjejuContentId: 'vj-001',
  sourceType: 'visitjeju',
  name: '성산일출봉',
  region: 'jeju-city',
  category: 'attraction',
  llmSummary: null,
  llmTags: [],
  status: 'pending',
  discoveredAt: '2026-01-01T00:00:00Z',
  sourcedFrom: 'visitjeju',
  lat: 33.46,
  lng: 126.93,
  thumbnailUrl: null,
  priceRange: null,
  enrichedAt: null,
  naverSourceUrl: null,
  naverSnippet: null,
  authenticityScore: null,
  ordinarinessScore: null,
  aiEstimatedScore: null,
  aiEstimatedAt: null,
  syntheticId: null,
  verifiedBy: null,
  tier: 'hidden',
  awardsHint: [],
  curatorComment: null,
};

function makeDeps(): AppDependencies {
  return {
    createTripUseCase: { execute: vi.fn() } as never,
    getRecommendationsUseCase: { execute: vi.fn() } as never,
    updateShortlistUseCase: { execute: vi.fn() } as never,
    composeDayPlanUseCase: { execute: vi.fn() } as never,
    editDayPlanUseCase: { execute: vi.fn() } as never,
    discoverCandidatesUseCase: { execute: vi.fn() } as never,
    listCandidatesUseCase: { execute: vi.fn().mockResolvedValue([]) } as never,
    enrichCandidateUseCase: { execute: vi.fn() } as never,
    approveCandidateUseCase: { execute: vi.fn() } as never,
    rejectCandidateUseCase: { execute: vi.fn() } as never,
    adjustCalibrationUseCase: { execute: vi.fn() } as never,
    runDiscoveryPipelineUseCase: {
      execute: vi.fn().mockResolvedValue(PIPELINE_RESULT),
    },
    getCandidateByIdUseCase: {
      execute: vi.fn().mockResolvedValue(CANDIDATE),
    },
    patchCandidateCoordinatesUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as never,
    embeddingBatcher: { run: vi.fn(), runSingle: vi.fn() } as never,
    labelStudioBridge: { handleWebhook: vi.fn(), handleWebhookWithSignature: vi.fn() } as never,
  };
}

describe('POST /api/v1/admin/curation/pipeline/run', () => {
  beforeEach(() => {
    process.env['CURATOR_SECRET'] = 'test-secret';
  });

  it('401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/pipeline/run',
      headers: { authorization: 'Bearer wrong' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('202 with pipeline result', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/pipeline/run',
      headers: { authorization: 'Bearer test-secret' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(202);
    const body = res.json<DiscoveryPipelineResult>();
    expect(body.visitjejuSaved).toBe(10);
    expect(body.naverSaved).toBe(5);
  });

  it('calls runDiscoveryPipelineUseCase.execute', async () => {
    const deps = makeDeps();
    const fastify = buildServer(deps);
    await fastify.ready();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/curation/pipeline/run',
      headers: { authorization: 'Bearer test-secret' },
    });
    await fastify.close();
    expect(deps.runDiscoveryPipelineUseCase.execute).toHaveBeenCalledOnce();
  });
});

describe('GET /api/v1/admin/curation/candidates/:id', () => {
  beforeEach(() => {
    process.env['CURATOR_SECRET'] = 'test-secret';
  });

  it('401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/admin/curation/candidates/cand-001',
      headers: { authorization: 'Bearer wrong' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('200 with candidate when found', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/admin/curation/candidates/cand-001',
      headers: { authorization: 'Bearer test-secret' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(200);
    const body = res.json<CurationCandidate>();
    expect(body.id).toBe('cand-001');
    expect(body.name).toBe('성산일출봉');
  });

  it('404 when candidate not found', async () => {
    const deps = makeDeps();
    (deps.getCandidateByIdUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const fastify = buildServer(deps);
    await fastify.ready();
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/admin/curation/candidates/missing-id',
      headers: { authorization: 'Bearer test-secret' },
    });
    await fastify.close();
    expect(res.statusCode).toBe(404);
    expect(res.json<{ code: string }>().code).toBe('CANDIDATE_NOT_FOUND');
  });
});
