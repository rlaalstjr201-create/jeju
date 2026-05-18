import { describe, it, expect, vi } from 'vitest';
import { SpotMetaInfererAdapter, SpotMetaInfererError } from './SpotMetaInfererAdapter.js';

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
// Fixture
// ---------------------------------------------------------------------------

function makeToolUseResponse(meta: {
  atmosphere?: string;
  crowd_level?: string;
  best_time?: string;
  target_visitor?: string;
} = {}) {
  return {
    content: [
      {
        type: 'tool_use',
        id: 'toolu_02',
        name: 'infer_spot_meta',
        input: {
          atmosphere: meta.atmosphere ?? '조용하고 자연적인 분위기',
          crowd_level: meta.crowd_level ?? '주말 오전 혼잡',
          best_time: meta.best_time ?? '평일 오전',
          target_visitor: meta.target_visitor ?? '자연을 좋아하는 여행자',
        },
      },
    ],
    usage: { input_tokens: 120, output_tokens: 80 },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpotMetaInfererAdapter.infer', () => {
  it('returns all 4 inference axes from tool_use response', async () => {
    mockCreate.mockResolvedValue(
      makeToolUseResponse({
        atmosphere: '일출 명소, 웅장하고 열린 자연',
        crowd_level: '주말 이른 아침 극혼잡',
        best_time: '일출 30분 전',
        target_visitor: '사진 촬영 목적 여행자, 커플',
      }),
    );

    const adapter = new SpotMetaInfererAdapter('test-key');
    const result = await adapter.infer({
      name: '성산일출봉',
      introduction: '유네스코 세계자연유산으로 등재된 오름',
      tags: '일출,오름,세계유산',
    });

    expect(result.atmosphere).toBe('일출 명소, 웅장하고 열린 자연');
    expect(result.crowd_level).toBe('주말 이른 아침 극혼잡');
    expect(result.best_time).toBe('일출 30분 전');
    expect(result.target_visitor).toBe('사진 촬영 목적 여행자, 커플');
  });

  it('non-tool_use response → throws SpotMetaInfererError', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'no tools' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const adapter = new SpotMetaInfererAdapter('test-key');
    await expect(
      adapter.infer({ name: 'test', introduction: 'test', tags: '' }),
    ).rejects.toBeInstanceOf(SpotMetaInfererError);
  });

  it('API error → throws SpotMetaInfererError', async () => {
    mockCreate.mockRejectedValue(new Error('timeout'));

    const adapter = new SpotMetaInfererAdapter('test-key');
    await expect(
      adapter.infer({ name: 'test', introduction: 'test', tags: '' }),
    ).rejects.toBeInstanceOf(SpotMetaInfererError);
  });
});
