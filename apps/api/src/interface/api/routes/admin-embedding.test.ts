import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';
import type { EmbeddingBatchResult } from '../../../application/ports/EmbeddingBatcherPort.js';

const BATCH_RESULT: EmbeddingBatchResult = {
  processed: 3,
  failed: 1,
  failedIds: ['spot-bad'],
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
    runDiscoveryPipelineUseCase: { execute: vi.fn() } as never,
    getCandidateByIdUseCase: { execute: vi.fn() } as never,
    patchCandidateCoordinatesUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as never,
    embeddingBatcher: {
      run: vi.fn().mockResolvedValue(BATCH_RESULT),
      runSingle: vi.fn(),
    },
    labelStudioBridge: { handleWebhook: vi.fn(), handleWebhookWithSignature: vi.fn() } as never,
    listApprovedSpotsUseCase: { execute: vi.fn().mockResolvedValue({ spots: [] }) } as never,
    getSpotByIdUseCase: { execute: vi.fn() } as never,
  };
}

describe('POST /api/v1/admin/embedding/batch', () => {
  beforeEach(() => {
    process.env['CURATOR_SECRET'] = 'test-secret';
  });

  afterEach(() => {
    delete process.env['CURATOR_SECRET'];
  });

  it('401 without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/embedding/batch',
      headers: { authorization: 'Bearer wrong' },
      body: {},
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
  });

  it('200 with batch result — no spotIds filter', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/embedding/batch',
      headers: { authorization: 'Bearer test-secret' },
      body: {},
    });
    await fastify.close();
    expect(res.statusCode).toBe(200);
    const body = res.json<EmbeddingBatchResult>();
    expect(body.processed).toBe(3);
    expect(body.failed).toBe(1);
    expect(body.failedIds).toEqual(['spot-bad']);
  });

  it('passes spotIds to embeddingBatcher.run when provided', async () => {
    const deps = makeDeps();
    const fastify = buildServer(deps);
    await fastify.ready();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/embedding/batch',
      headers: { authorization: 'Bearer test-secret' },
      body: { spotIds: ['spot-1', 'spot-2'] },
    });
    await fastify.close();
    expect(deps.embeddingBatcher.run).toHaveBeenCalledWith(['spot-1', 'spot-2']);
  });

  it('calls embeddingBatcher.run with undefined when no spotIds', async () => {
    const deps = makeDeps();
    const fastify = buildServer(deps);
    await fastify.ready();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/embedding/batch',
      headers: { authorization: 'Bearer test-secret' },
      body: {},
    });
    await fastify.close();
    expect(deps.embeddingBatcher.run).toHaveBeenCalledWith(undefined);
  });
});
