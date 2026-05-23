import { describe, it, expect, vi } from 'vitest';
import { SpotMetaInfererAdapter, SpotMetaInfererError } from './SpotMetaInfererAdapter.js';
import type { LlmProviderPort } from '../../application/ports/LlmProviderPort.js';

// ---------------------------------------------------------------------------
// Mock LlmProviderPort
// ---------------------------------------------------------------------------

function makeProvider(returnVal: Record<string, unknown>): LlmProviderPort {
  return { callWithTool: vi.fn().mockResolvedValue(returnVal), callWithTools: vi.fn() };
}

function makeErrorProvider(err: Error): LlmProviderPort {
  return { callWithTool: vi.fn().mockRejectedValue(err), callWithTools: vi.fn() };
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeInference(overrides: {
  atmosphere?: string;
  crowd_level?: string;
  best_time?: string;
  target_visitor?: string;
} = {}): Record<string, unknown> {
  return {
    atmosphere: overrides.atmosphere ?? '조용하고 자연적인 분위기',
    crowd_level: overrides.crowd_level ?? '주말 오전 혼잡',
    best_time: overrides.best_time ?? '평일 오전',
    target_visitor: overrides.target_visitor ?? '자연을 좋아하는 여행자',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpotMetaInfererAdapter.infer', () => {
  it('returns all 4 inference axes from provider response', async () => {
    const provider = makeProvider(
      makeInference({
        atmosphere: '일출 명소, 웅장하고 열린 자연',
        crowd_level: '주말 이른 아침 극혼잡',
        best_time: '일출 30분 전',
        target_visitor: '사진 촬영 목적 여행자, 커플',
      }),
    );

    const adapter = new SpotMetaInfererAdapter(provider);
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

  it('provider error → throws SpotMetaInfererError', async () => {
    const provider = makeErrorProvider(new Error('timeout'));
    const adapter = new SpotMetaInfererAdapter(provider);
    await expect(
      adapter.infer({ name: 'test', introduction: 'test', tags: '' }),
    ).rejects.toBeInstanceOf(SpotMetaInfererError);
  });

  it('sends correct prompt with place name, introduction, and tags', async () => {
    const provider = makeProvider(makeInference());
    const adapter = new SpotMetaInfererAdapter(provider);
    await adapter.infer({ name: '성산일출봉', introduction: '유네스코 유산', tags: '일출,오름' });

    const callArgs = (provider.callWithTool as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const prompt = callArgs.userMessage as string;
    expect(prompt).toContain('성산일출봉');
    expect(prompt).toContain('유네스코 유산');
    expect(prompt).toContain('일출,오름');
  });

  it('uses callWithTool with infer_spot_meta tool name', async () => {
    const provider = makeProvider(makeInference());
    const adapter = new SpotMetaInfererAdapter(provider);
    await adapter.infer({ name: 'test', introduction: 'test', tags: '' });

    const callArgs = (provider.callWithTool as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArgs.tool.name).toBe('infer_spot_meta');
  });
});
