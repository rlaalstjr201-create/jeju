import { describe, it, expect, vi } from 'vitest';
import { LlmExtractorAdapter, LlmExtractorError } from './LlmExtractorAdapter.js';

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeToolUseResponse(extraction: {
  spot_name?: string | null;
  category?: string;
  authenticity_score?: number;
  ordinariness_score?: number;
  summary?: string;
}) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'toolu_01',
        name: 'extract_spot',
        input: {
          spot_name: extraction.spot_name !== undefined ? extraction.spot_name : '테스트 카페',
          category: extraction.category ?? 'cafe',
          authenticity_score: extraction.authenticity_score ?? 0.8,
          ordinariness_score: extraction.ordinariness_score ?? 0.2,
          summary: extraction.summary ?? '현지인이 즐겨 찾는 작은 카페입니다.',
        },
      },
    ],
    usage: { input_tokens: 150, output_tokens: 60 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmExtractorAdapter.extract', () => {
  it('returns structured extraction from tool_use response', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({
        spot_name: '만장굴 인근 카페',
        category: 'cafe',
        authenticity_score: 0.9,
        ordinariness_score: 0.1,
        summary: '관광객이 잘 모르는 동굴 인근 로컬 카페',
      }),
    );

    const adapter = new LlmExtractorAdapter('test-key');
    const result = await adapter.extract({
      snippet: '만장굴 옆에 있는 작은 카페, 현지인만 아는 곳',
      query: '제주 만장굴 근처 카페',
    });

    expect(result.spot_name).toBe('만장굴 인근 카페');
    expect(result.category).toBe('cafe');
    expect(result.authenticity_score).toBe(0.9);
    expect(result.ordinariness_score).toBe(0.1);
    expect(result.summary).toBe('관광객이 잘 모르는 동굴 인근 로컬 카페');
  });

  it('spot_name null → returns null (unidentifiable)', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({ spot_name: null }),
    );

    const adapter = new LlmExtractorAdapter('test-key');
    const result = await adapter.extract({ snippet: '뭔가 모를 글', query: '제주' });

    expect(result.spot_name).toBeNull();
  });

  it('clamps authenticity_score to [0, 1]', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({ authenticity_score: 1.5 }),
    );

    const adapter = new LlmExtractorAdapter('test-key');
    const result = await adapter.extract({ snippet: 'test', query: 'q' });

    expect(result.authenticity_score).toBe(1.0);
  });

  it('clamps ordinariness_score to [0, 1]', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({ ordinariness_score: -0.3 }),
    );

    const adapter = new LlmExtractorAdapter('test-key');
    const result = await adapter.extract({ snippet: 'test', query: 'q' });

    expect(result.ordinariness_score).toBe(0.0);
  });

  it('unknown category → falls back to "other"', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({ category: 'unknown_type' }),
    );

    const adapter = new LlmExtractorAdapter('test-key');
    const result = await adapter.extract({ snippet: 'test', query: 'q' });

    expect(result.category).toBe('other');
  });

  it('non-tool_use response → throws LlmExtractorError', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'sorry, cannot extract' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const adapter = new LlmExtractorAdapter('test-key');
    await expect(adapter.extract({ snippet: 'test', query: 'q' })).rejects.toBeInstanceOf(LlmExtractorError);
  });

  it('API error → throws LlmExtractorError', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'));

    const adapter = new LlmExtractorAdapter('test-key');
    await expect(adapter.extract({ snippet: 'test', query: 'q' })).rejects.toBeInstanceOf(LlmExtractorError);
  });
});
