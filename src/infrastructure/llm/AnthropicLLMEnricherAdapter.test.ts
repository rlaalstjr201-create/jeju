import { describe, it, expect, vi } from 'vitest';
import { AnthropicLLMEnricherAdapter } from './AnthropicLLMEnricherAdapter.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

function makeCandidate(): CurationCandidate {
  return {
    id: 'c-1',
    kakaoPlaceId: 'kp-1',
    visitjejuContentId: null,
    sourceType: 'visitjeju' as const,
    name: 'Test Café',
    region: 'jeju-city',
    category: 'cafe',
    llmSummary: null,
    llmTags: [],
    status: 'pending',
    discoveredAt: '2026-05-18',
    sourcedFrom: 'discovery-datalab',
    lat: null,
    lng: null,
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
  };
}

function makeLLMResponse(priceRange: string | null) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          summary: '아름다운 카페입니다. 제주 시내에 위치합니다.',
          tags: ['카페', '인테리어', '디저트'],
          priceRange,
        }),
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe('AnthropicLLMEnricherAdapter — priceRange normalization (M4)', () => {
  it('(M4) maps "high" → "premium"', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse('high'));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBe('premium');
  });

  it('(M4) unknown value "expensive" → null', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse('expensive'));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBeNull();
  });

  it('passes valid "premium" through unchanged', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse('premium'));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBe('premium');
  });

  it('passes valid "budget" through unchanged', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse('budget'));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBe('budget');
  });

  it('string "null" → null', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse('null'));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBeNull();
  });

  it('null value → null', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse(null));
    const adapter = new AnthropicLLMEnricherAdapter('test-key');
    const result = await adapter.enrich(makeCandidate());
    expect(result.priceRange).toBeNull();
  });
});
