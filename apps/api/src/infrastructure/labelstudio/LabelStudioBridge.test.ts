import { describe, it, expect, vi } from 'vitest';
import { LabelStudioBridge, LabelStudioWebhookError } from './LabelStudioBridge.js';
import type { LabelStudioAnnotationPayload } from './LabelStudioBridge.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeApprovePayload(overrides: Partial<LabelStudioAnnotationPayload> = {}): LabelStudioAnnotationPayload {
  return {
    action: 'ANNOTATION_CREATED',
    annotation: {
      id: 42,
      result: [
        {
          from_name: 'decision',
          value: { choices: ['approve'] },
        },
        {
          from_name: 'curation_score',
          value: { number: 85 },
        },
        {
          from_name: 'free_memo',
          value: { text: ['매력적인 장소'] },
        },
      ],
      completed_by: { username: 'curator' },
    },
    task: {
      data: { candidate_id: 'cand-abc' },
    },
    ...overrides,
  };
}

function makeRejectPayload(): LabelStudioAnnotationPayload {
  return {
    action: 'ANNOTATION_CREATED',
    annotation: {
      id: 43,
      result: [
        { from_name: 'decision', value: { choices: ['reject'] } },
        { from_name: 'rejection_reason', value: { choices: ['ordinary'] } },
        { from_name: 'rejection_reason_text', value: { text: ['너무 유명한 관광지'] } },
      ],
      completed_by: { username: 'curator' },
    },
    task: { data: { candidate_id: 'cand-xyz' } },
  };
}

function makeHoldPayload(): LabelStudioAnnotationPayload {
  return {
    action: 'ANNOTATION_CREATED',
    annotation: {
      id: 44,
      result: [
        { from_name: 'decision', value: { choices: ['hold'] } },
      ],
      completed_by: { username: 'curator' },
    },
    task: { data: { candidate_id: 'cand-hold' } },
  };
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

function makePersistUseCase() {
  return { execute: vi.fn().mockResolvedValue({ decisionId: 'dec-001' }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LabelStudioBridge.handleWebhook', () => {
  it('approve payload → calls PersistCurationDecisionUseCase with correct args', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'webhook-secret');

    await bridge.handleWebhook(makeApprovePayload());

    expect(useCase.execute).toHaveBeenCalledWith({
      candidateId: 'cand-abc',
      decidedBy: 'curator',
      decision: 'approve',
      curationScore: 85,
      rejectionReasonEnum: undefined,
      rejectionReasonText: undefined,
      freeMemo: '매력적인 장소',
    });
  });

  it('approve payload — maps curationScore and freeMemo correctly', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    await bridge.handleWebhook(makeApprovePayload());

    const call = useCase.execute.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['curationScore']).toBe(85);
    expect(call['decision']).toBe('approve');
    expect(call['candidateId']).toBe('cand-abc');
    expect(call['decidedBy']).toBe('curator');
  });

  it('reject payload → maps rejection_reason and rejection_reason_text', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    await bridge.handleWebhook(makeRejectPayload());

    const call = useCase.execute.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['decision']).toBe('reject');
    expect(call['rejectionReasonEnum']).toBe('ordinary');
    expect(call['rejectionReasonText']).toBe('너무 유명한 관광지');
    expect(call['curationScore']).toBeUndefined();
  });

  it('hold payload → decision=hold, no status update fields', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    await bridge.handleWebhook(makeHoldPayload());

    const call = useCase.execute.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['decision']).toBe('hold');
    expect(call['candidateId']).toBe('cand-hold');
  });

  it('non-ANNOTATION_CREATED action → silently ignores (no execute call)', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    await bridge.handleWebhook({ action: 'ANNOTATION_DELETED', task: {}, annotation: {} });

    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('missing candidate_id → throws LabelStudioWebhookError', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    const payload = makeApprovePayload();
    payload.task.data = {};

    await expect(bridge.handleWebhook(payload)).rejects.toBeInstanceOf(LabelStudioWebhookError);
  });

  it('invalid payload shape (not an object) → throws LabelStudioWebhookError', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'secret');

    await expect(bridge.handleWebhook('not-an-object')).rejects.toBeInstanceOf(LabelStudioWebhookError);
  });

  it('HMAC secret validation — wrong signature throws LabelStudioWebhookError', async () => {
    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, 'real-secret');

    await expect(
      bridge.handleWebhookWithSignature(
        JSON.stringify(makeApprovePayload()),
        'wrong-sig',
      ),
    ).rejects.toBeInstanceOf(LabelStudioWebhookError);
  });

  it('HMAC secret validation — correct signature passes', async () => {
    const { createHmac } = await import('node:crypto');
    const secret = 'test-secret';
    const payload = JSON.stringify(makeApprovePayload());
    const sig = createHmac('sha256', secret).update(payload).digest('hex');

    const useCase = makePersistUseCase();
    const bridge = new LabelStudioBridge(useCase as never, secret);

    await expect(bridge.handleWebhookWithSignature(payload, sig)).resolves.not.toThrow();
  });
});
