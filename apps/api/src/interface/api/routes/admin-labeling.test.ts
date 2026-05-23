import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildServer } from '../server.js';
import type { AppDependencies } from '../AppDependencies.js';

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
    embeddingBatcher: { run: vi.fn(), runSingle: vi.fn() } as never,
    labelStudioBridge: {
      handleWebhook: vi.fn(),
      handleWebhookWithSignature: vi.fn().mockResolvedValue(undefined),
    },
    listApprovedSpotsUseCase: { execute: vi.fn().mockResolvedValue({ spots: [] }) } as never,
  };
}

const PAYLOAD = JSON.stringify({ action: 'ANNOTATION_CREATED', annotation: {}, task: {} });

describe('POST /api/v1/admin/labeling/webhook', () => {
  it('204 when bridge resolves', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/labeling/webhook',
      headers: {
        'content-type': 'application/json',
        'x-label-studio-signature': 'any-sig',
      },
      body: PAYLOAD,
    });
    await fastify.close();
    expect(res.statusCode).toBe(204);
  });

  it('passes raw body string and signature header to bridge', async () => {
    const deps = makeDeps();
    const fastify = buildServer(deps);
    await fastify.ready();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/labeling/webhook',
      headers: {
        'content-type': 'application/json',
        'x-label-studio-signature': 'test-sig',
      },
      body: PAYLOAD,
    });
    await fastify.close();
    expect(deps.labelStudioBridge.handleWebhookWithSignature).toHaveBeenCalledWith(
      PAYLOAD,
      'test-sig',
    );
  });

  it('401 when bridge throws signature error', async () => {
    const deps = makeDeps();
    const sigErr = new Error('Invalid webhook signature');
    sigErr.name = 'LabelStudioWebhookError';
    (deps.labelStudioBridge.handleWebhookWithSignature as ReturnType<typeof vi.fn>).mockRejectedValue(sigErr);
    const fastify = buildServer(deps);
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/labeling/webhook',
      headers: {
        'content-type': 'application/json',
        'x-label-studio-signature': 'bad-sig',
      },
      body: PAYLOAD,
    });
    await fastify.close();
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('INVALID_SIGNATURE');
  });

  it('400 when bridge throws payload error', async () => {
    const deps = makeDeps();
    const payloadErr = new Error('Missing candidate_id in task data');
    payloadErr.name = 'LabelStudioWebhookError';
    (deps.labelStudioBridge.handleWebhookWithSignature as ReturnType<typeof vi.fn>).mockRejectedValue(payloadErr);
    const fastify = buildServer(deps);
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/labeling/webhook',
      headers: {
        'content-type': 'application/json',
        'x-label-studio-signature': 'sig',
      },
      body: PAYLOAD,
    });
    await fastify.close();
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('WEBHOOK_ERROR');
  });

  it('no curator auth required — accessible without curator token', async () => {
    const fastify = buildServer(makeDeps());
    await fastify.ready();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/admin/labeling/webhook',
      headers: {
        'content-type': 'application/json',
        // no Authorization header
      },
      body: PAYLOAD,
    });
    await fastify.close();
    // Should not 401 from requireCuratorRole (HMAC-only protection via bridge)
    expect(res.statusCode).toBe(204);
  });
});
