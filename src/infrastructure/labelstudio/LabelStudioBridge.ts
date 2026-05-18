import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LabelStudioBridgePort } from '../../application/ports/LabelStudioBridgePort.js';
import type { PersistCurationDecisionUseCase } from '../../application/curation/PersistCurationDecisionUseCase.js';
import type { RejectionReasonEnum } from '../../domain/curation/CurationDecision.js';

export class LabelStudioWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabelStudioWebhookError';
  }
}

// Label Studio annotation result shape
interface AnnotationResult {
  from_name: string;
  value: {
    choices?: string[];
    number?: number;
    text?: string[];
  };
}

export interface LabelStudioAnnotationPayload {
  action: string;
  annotation: {
    id: number;
    result: AnnotationResult[];
    completed_by: { username: string };
  };
  task: {
    data: Record<string, unknown>;
  };
}

function extractResult(results: AnnotationResult[], fromName: string): AnnotationResult['value'] | undefined {
  return results.find((r) => r.from_name === fromName)?.value;
}

function parsePayload(raw: unknown): LabelStudioAnnotationPayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new LabelStudioWebhookError('Invalid webhook payload: not an object');
  }
  return raw as LabelStudioAnnotationPayload;
}

export class LabelStudioBridge implements LabelStudioBridgePort {
  constructor(
    private readonly persistDecision: Pick<PersistCurationDecisionUseCase, 'execute'>,
    private readonly webhookSecret: string,
  ) {}

  async handleWebhook(raw: unknown): Promise<void> {
    const payload = parsePayload(raw);

    // Only handle new annotation events
    if (payload.action !== 'ANNOTATION_CREATED') return;

    const candidateId = payload.task?.data?.['candidate_id'];
    if (typeof candidateId !== 'string' || !candidateId) {
      throw new LabelStudioWebhookError('Missing candidate_id in task data');
    }

    const results = payload.annotation?.result ?? [];
    const decidedBy = payload.annotation?.completed_by?.username ?? 'unknown';

    const decisionValue = extractResult(results, 'decision');
    const decision = decisionValue?.choices?.[0] as 'approve' | 'reject' | 'hold' | undefined;
    if (!decision) {
      throw new LabelStudioWebhookError('Missing decision in annotation result');
    }

    const curationScoreValue = extractResult(results, 'curation_score');
    const curationScore = curationScoreValue?.number;

    const rejectionReasonValue = extractResult(results, 'rejection_reason');
    const rejectionReasonEnum = rejectionReasonValue?.choices?.[0] as RejectionReasonEnum | undefined;

    const rejectionReasonTextValue = extractResult(results, 'rejection_reason_text');
    const rejectionReasonText = rejectionReasonTextValue?.text?.[0];

    const freeMemoValue = extractResult(results, 'free_memo');
    const freeMemo = freeMemoValue?.text?.[0];

    await this.persistDecision.execute({
      candidateId,
      decidedBy,
      decision,
      ...(curationScore !== undefined && { curationScore }),
      ...(rejectionReasonEnum !== undefined && { rejectionReasonEnum }),
      ...(rejectionReasonText !== undefined && { rejectionReasonText }),
      ...(freeMemo !== undefined && { freeMemo }),
    });
  }

  async handleWebhookWithSignature(rawBody: string, signature: string): Promise<void> {
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    const valid =
      expectedBuf.length === signatureBuf.length &&
      timingSafeEqual(expectedBuf, signatureBuf);

    if (!valid) {
      throw new LabelStudioWebhookError('Invalid webhook signature');
    }

    await this.handleWebhook(JSON.parse(rawBody) as unknown);
  }
}
