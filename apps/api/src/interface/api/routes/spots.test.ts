import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';
import type { ListApprovedSpotsResult } from '../../../application/spots/ListApprovedSpotsUseCase.js';

function makeSpot(overrides: Partial<ListApprovedSpotsResult['spots'][number]> = {}): ListApprovedSpotsResult['spots'][number] {
  return {
    id: 'spot-1',
    name: '테스트 스팟',
    category: 'sightseeing',
    lat: 33.4,
    lng: 126.5,
    thumbnailUrl: null,
    curatorComment: '좋은 곳',
    region: 'jeju' as never,
    ...overrides,
  };
}

function makeDeps(spotsResult: ListApprovedSpotsResult = { spots: [] }): AppDependencies {
  return {
    createTripUseCase: { execute: vi.fn() } as never,
    getRecommendationsUseCase: { execute: vi.fn() } as never,
    updateShortlistUseCase: { execute: vi.fn() } as never,
    composeDayPlanUseCase: { execute: vi.fn() } as never,
    editDayPlanUseCase: { execute: vi.fn() } as never,
    discoverCandidatesUseCase: { execute: vi.fn() } as never,
    listCandidatesUseCase: { execute: vi.fn() } as never,
    enrichCandidateUseCase: { execute: vi.fn() } as never,
    approveCandidateUseCase: { execute: vi.fn() } as never,
    rejectCandidateUseCase: { execute: vi.fn() } as never,
    adjustCalibrationUseCase: { execute: vi.fn() } as never,
    runDiscoveryPipelineUseCase: { execute: vi.fn() } as never,
    getCandidateByIdUseCase: { execute: vi.fn() } as never,
    patchCandidateCoordinatesUseCase: { execute: vi.fn() } as never,
    embeddingBatcher: { run: vi.fn(), runSingle: vi.fn() } as never,
    labelStudioBridge: { handleWebhook: vi.fn(), handleWebhookWithSignature: vi.fn() } as never,
    listApprovedSpotsUseCase: {
      execute: vi.fn().mockResolvedValue(spotsResult),
    } as never,
  };
}

describe('GET /api/v1/spots', () => {
  it('전체 조회 — 200 + spots 배열 반환', async () => {
    const spots = [makeSpot({ id: 'a' }), makeSpot({ id: 'b' })];
    const fastify = buildServer(makeDeps({ spots }));
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/spots' });
    await fastify.close();

    expect(res.statusCode).toBe(200);
    expect(res.json<ListApprovedSpotsResult>().spots).toHaveLength(2);
  });

  it('category 필터 — use case에 category 전달됨', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ spots: [makeSpot({ category: 'cafe' })] });
    const deps = makeDeps();
    (deps.listApprovedSpotsUseCase as never as { execute: typeof mockExecute }).execute = mockExecute;

    const fastify = buildServer(deps);
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/spots?category=cafe' });
    await fastify.close();

    expect(res.statusCode).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith({ category: 'cafe' });
    expect(res.json<ListApprovedSpotsResult>().spots[0]?.category).toBe('cafe');
  });

  it('잘못된 category — 400 VALIDATION_ERROR', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/spots?category=invalid' });
    await fastify.close();

    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR');
  });

  it('응답에 별점·리뷰수 필드 없음', async () => {
    const fastify = buildServer(makeDeps({ spots: [makeSpot()] }));
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/spots' });
    await fastify.close();

    const spot = res.json<ListApprovedSpotsResult>().spots[0] as Record<string, unknown>;
    expect(spot['rating']).toBeUndefined();
    expect(spot['reviewCount']).toBeUndefined();
    expect(spot['popularityScore']).toBeUndefined();
  });

  it('use case가 throw하면 500 반환', async () => {
    const deps = makeDeps();
    (deps.listApprovedSpotsUseCase.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB 연결 실패'),
    );

    const fastify = buildServer(deps);
    await fastify.ready();

    const res = await fastify.inject({ method: 'GET', url: '/api/v1/spots' });
    await fastify.close();

    expect(res.statusCode).toBe(500);
  });
});
