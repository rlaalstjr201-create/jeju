import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmExtractorAdapter, LlmExtractorError } from './LlmExtractorAdapter.js';
import type { LlmProviderPort, LlmAgentParams } from '../../application/ports/LlmProviderPort.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProvider(callWithToolResult?: Record<string, unknown>): LlmProviderPort {
  return {
    callWithTool: vi.fn().mockResolvedValue(callWithToolResult ?? {
      spot_name: '테스트 카페',
      parent_spot_hint: null,
      category: 'cafe',
      authenticity_score: 0.8,
      ordinariness_score: 0.2,
      summary: '현지인이 즐겨 찾는 작은 카페입니다.',
    }),
    callWithTools: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Single call mode tests (existing + new fields)
// ---------------------------------------------------------------------------

describe('LlmExtractorAdapter (single call mode)', () => {
  it('returns structured extraction with new fields (extraction_confidence, verification_status)', async () => {
    const provider = makeProvider({
      spot_name: '만장굴 인근 카페',
      parent_spot_hint: null,
      category: 'cafe',
      authenticity_score: 0.9,
      ordinariness_score: 0.1,
      summary: '관광객이 잘 모르는 동굴 인근 로컬 카페',
    });

    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({
      snippet: '만장굴 옆에 있는 작은 카페, 현지인만 아는 곳',
      query: '제주 만장굴 근처 카페',
    });

    expect(result.spot_name).toBe('만장굴 인근 카페');
    expect(result.category).toBe('cafe');
    expect(result.authenticity_score).toBe(0.9);
    expect(result.ordinariness_score).toBe(0.1);
    expect(result.summary).toBe('관광객이 잘 모르는 동굴 인근 로컬 카페');
    expect(result.extraction_confidence).toBe(1.0);
    expect(result.verification_status).toBe('unverified');
  });

  it('spot_name null → returns null (unidentifiable)', async () => {
    const provider = makeProvider({ spot_name: null, parent_spot_hint: null, category: 'other', authenticity_score: 0.5, ordinariness_score: 0.5, summary: '알 수 없는 장소' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: '뭔가 모를 글', query: '제주' });
    expect(result.spot_name).toBeNull();
    expect(result.verification_status).toBe('unverified');
  });

  it('"null" string spot_name → null', async () => {
    const provider = makeProvider({ spot_name: 'null', parent_spot_hint: null, category: 'other', authenticity_score: 0.5, ordinariness_score: 0.5, summary: '' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.spot_name).toBeNull();
  });

  it('empty string spot_name → null', async () => {
    const provider = makeProvider({ spot_name: '', parent_spot_hint: null, category: 'other', authenticity_score: 0.5, ordinariness_score: 0.5, summary: '' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.spot_name).toBeNull();
  });

  it('clamps authenticity_score to [0, 1]', async () => {
    const provider = makeProvider({ spot_name: null, parent_spot_hint: null, category: 'cafe', authenticity_score: 1.5, ordinariness_score: 0.2, summary: 'test' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.authenticity_score).toBe(1.0);
  });

  it('clamps ordinariness_score to [0, 1]', async () => {
    const provider = makeProvider({ spot_name: null, parent_spot_hint: null, category: 'cafe', authenticity_score: 0.5, ordinariness_score: -0.3, summary: 'test' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.ordinariness_score).toBe(0.0);
  });

  it('unknown category → falls back to "other"', async () => {
    const provider = makeProvider({ spot_name: null, parent_spot_hint: null, category: 'unknown_type', authenticity_score: 0.5, ordinariness_score: 0.5, summary: 'test' });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.category).toBe('other');
  });

  it('callWithTool called (no searchDeps → single call mode)', async () => {
    const provider = makeProvider();
    const adapter = new LlmExtractorAdapter(provider);
    await adapter.extract({ snippet: 'test', query: 'test' });
    expect(provider.callWithTool).toHaveBeenCalledOnce();
    expect(provider.callWithTools).not.toHaveBeenCalled();
  });

  it('callWithTool failure → throws LlmExtractorError', async () => {
    const provider: LlmProviderPort = {
      callWithTool: vi.fn().mockRejectedValue(new Error('API timeout')),
      callWithTools: vi.fn(),
    };
    const adapter = new LlmExtractorAdapter(provider);
    await expect(adapter.extract({ snippet: 'test', query: 'q' })).rejects.toBeInstanceOf(LlmExtractorError);
  });
});

// ---------------------------------------------------------------------------
// Tool calling mode tests
// ---------------------------------------------------------------------------

describe('LlmExtractorAdapter (tool calling mode)', () => {
  it('calls kakaoSearch and returns verified_kakao result', async () => {
    const mockKakaoSearch = vi.fn().mockResolvedValue([
      { name: '선흘곶식당', category: '한식', address: '제주시 조천읍', lat: 33.5, lng: 126.7, placeId: 'k1' },
    ]);
    const mockNaverSearch = vi.fn().mockResolvedValue([]);

    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockImplementation(async (params: LlmAgentParams) => {
        // Simulate: LLM calls search_kakao_local first
        await params.onToolCall('search_kakao_local', { query: '선흘곶식당' }, 'call_1');
        // Then returns extract_spot
        return {
          finalToolName: 'extract_spot',
          finalArgs: {
            spot_name: '선흘곶식당',
            parent_spot_hint: null,
            category: 'restaurant',
            authenticity_score: 0.9,
            ordinariness_score: 0.2,
            summary: '선흘곶 숨은 식당',
            extraction_confidence: 0.95,
            verification_status: 'verified_kakao',
          },
        };
      }),
    };

    const adapter = new LlmExtractorAdapter(mockProvider, {
      kakaoSearch: mockKakaoSearch,
      naverSearch: mockNaverSearch,
    });
    const result = await adapter.extract({ snippet: '선흘곶식당 입구가 숨어있는...', query: '제주 식당' });

    expect(result.spot_name).toBe('선흘곶식당');
    expect(result.verification_status).toBe('verified_kakao');
    expect(result.extraction_confidence).toBe(0.95);
    expect(mockProvider.callWithTools).toHaveBeenCalledOnce();
    expect(mockProvider.callWithTool).not.toHaveBeenCalled();
    expect(mockKakaoSearch).toHaveBeenCalledWith('선흘곶식당');
  });

  it('empty string spot_name → null', async () => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockResolvedValue({
        finalToolName: 'extract_spot',
        finalArgs: {
          spot_name: '',
          parent_spot_hint: null,
          category: 'other',
          authenticity_score: 0.5,
          ordinariness_score: 0.5,
          summary: '',
          extraction_confidence: 0.1,
          verification_status: 'unverified',
        },
      }),
    };
    const adapter = new LlmExtractorAdapter(mockProvider, {
      kakaoSearch: vi.fn(),
      naverSearch: vi.fn(),
    });
    const result = await adapter.extract({ snippet: 'test', query: 'test' });
    expect(result.spot_name).toBeNull();
  });

  it('no searchDeps → uses single call mode (callWithTool)', async () => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn().mockResolvedValue({
        spot_name: '테스트',
        parent_spot_hint: null,
        category: 'cafe',
        authenticity_score: 0.8,
        ordinariness_score: 0.2,
        summary: '테스트 카페',
      }),
      callWithTools: vi.fn(),
    };
    const adapter = new LlmExtractorAdapter(mockProvider); // no searchDeps
    await adapter.extract({ snippet: 'test', query: 'test' });
    expect(mockProvider.callWithTool).toHaveBeenCalledOnce();
    expect(mockProvider.callWithTools).not.toHaveBeenCalled();
  });

  it('"null" string spot_name → null in tool calling mode', async () => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockResolvedValue({
        finalToolName: 'extract_spot',
        finalArgs: {
          spot_name: 'null',
          category: 'other',
          authenticity_score: 0.5,
          ordinariness_score: 0.5,
          summary: '',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
        },
      }),
    };
    const adapter = new LlmExtractorAdapter(mockProvider, { kakaoSearch: vi.fn(), naverSearch: vi.fn() });
    const result = await adapter.extract({ snippet: 'test', query: 'test' });
    expect(result.spot_name).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Bug Fix 3: Korean null string normalization (5 TDD cases)
  // ---------------------------------------------------------------------------

  it.each([
    ['식별 불가'],
    ['불명'],
    ['알 수 없음'],
    ['미상'],
    ['N/A'],
  ])('Korean null string "%s" → spot_name null', async (korNull) => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockResolvedValue({
        finalToolName: 'extract_spot',
        finalArgs: {
          spot_name: korNull,
          category: 'other',
          authenticity_score: 0.5,
          ordinariness_score: 0.5,
          summary: '',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
        },
      }),
    };
    const adapter = new LlmExtractorAdapter(mockProvider, { kakaoSearch: vi.fn(), naverSearch: vi.fn() });
    const result = await adapter.extract({ snippet: 'test', query: 'test' });
    expect(result.spot_name).toBeNull();
  });

  // Bug Fix 3: also apply in single-call mode
  it.each([
    ['식별 불가'],
    ['불명'],
    ['알 수 없음'],
    ['미상'],
    ['N/A'],
  ])('Korean null string "%s" → spot_name null (single-call mode)', async (korNull) => {
    const provider = makeProvider({
      spot_name: korNull,
      parent_spot_hint: null,
      category: 'other',
      authenticity_score: 0.5,
      ordinariness_score: 0.5,
      summary: '',
    });
    const adapter = new LlmExtractorAdapter(provider);
    const result = await adapter.extract({ snippet: 'test', query: 'q' });
    expect(result.spot_name).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Bug Fix 2: Safety net — LLM text response instead of tool_calls
  // ---------------------------------------------------------------------------

  it('callWithTools throws "no tool_calls" → returns null extraction with confidence=0', async () => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockRejectedValue(new Error('LLM returned no tool_calls')),
    };
    const adapter = new LlmExtractorAdapter(mockProvider, { kakaoSearch: vi.fn(), naverSearch: vi.fn() });
    const result = await adapter.extract({ snippet: 'test', query: 'test' });
    expect(result.spot_name).toBeNull();
    expect(result.extraction_confidence).toBe(0);
    expect(result.verification_status).toBe('unverified');
  });

  it('callWithTools throws "Max iterations exceeded" → returns null extraction with confidence=0', async () => {
    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockRejectedValue(new Error('Max iterations exceeded')),
    };
    const adapter = new LlmExtractorAdapter(mockProvider, { kakaoSearch: vi.fn(), naverSearch: vi.fn() });
    const result = await adapter.extract({ snippet: 'test', query: 'test' });
    expect(result.spot_name).toBeNull();
    expect(result.extraction_confidence).toBe(0);
    expect(result.verification_status).toBe('unverified');
  });

  // ---------------------------------------------------------------------------
  // Bug Fix 1: Name-match filter — geographic prefix must not be accepted
  // ---------------------------------------------------------------------------

  it('Kakao geographic prefix result filtered out → treated as 0 results', async () => {
    const mockKakaoSearch = vi.fn()
      // Returns "선흌곶" (geographic prefix) for "선흌곶식당" query — should be filtered
      .mockResolvedValueOnce([{ name: '선흌곶', category: '자연환경', address: '제주', lat: 33.5, lng: 126.7, placeId: 'k1' }])
      // Returns "선흌곶식당" for direct Naver search
      .mockResolvedValueOnce([]);
    const mockNaverSearch = vi.fn().mockResolvedValue([
      { name: '선흌곶식당', category: '한식', address: '제주 조천읍', lat: 33.5, lng: 126.7 },
    ]);

    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockImplementation(async (params: LlmAgentParams) => {
        const kakaoResult = await params.onToolCall('search_kakao_local', { query: '선흌곶식당' }, 'c1');
        // Adapter should have returned 0 results since "선흌곶" doesn't contain "선흌곶식당"
        expect(JSON.parse(kakaoResult).results).toHaveLength(0);
        // LLM then falls back to Naver
        await params.onToolCall('search_naver_local', { query: '선흌곶식당' }, 'c2');
        return {
          finalToolName: 'extract_spot',
          finalArgs: {
            spot_name: '선흌곶식당',
            parent_spot_hint: null,
            category: 'restaurant',
            authenticity_score: 0.85,
            ordinariness_score: 0.2,
            summary: '선흌곶 숨은 식당',
            extraction_confidence: 0.9,
            verification_status: 'verified_naver',
          },
        };
      }),
    };

    const adapter = new LlmExtractorAdapter(mockProvider, {
      kakaoSearch: mockKakaoSearch,
      naverSearch: mockNaverSearch,
    });
    const result = await adapter.extract({ snippet: '선흌곶식당 입구가 숨어있어요', query: '제주 식당' });
    expect(result.spot_name).toBe('선흌곶식당');
    expect(result.verification_status).toBe('verified_naver');
    expect(mockKakaoSearch).toHaveBeenCalledWith('선흌곶식당');
    expect(mockNaverSearch).toHaveBeenCalledWith('선흌곶식당');
  });

  it('naverSearch called when kakaoSearch returns empty', async () => {
    const mockKakaoSearch = vi.fn().mockResolvedValue([]);
    const mockNaverSearch = vi.fn().mockResolvedValue([{ name: '금능해수욕장', category: '해수욕장', address: '제주 한림', lat: 33.46, lng: 126.25 }]);

    const mockProvider: LlmProviderPort = {
      callWithTool: vi.fn(),
      callWithTools: vi.fn().mockImplementation(async (params: LlmAgentParams) => {
        await params.onToolCall('search_kakao_local', { query: '금능' }, 'call_k1');
        await params.onToolCall('search_naver_local', { query: '금능해수욕장' }, 'call_n1');
        return {
          finalToolName: 'extract_spot',
          finalArgs: {
            spot_name: '금능해수욕장',
            parent_spot_hint: null,
            category: 'natural',
            authenticity_score: 0.8,
            ordinariness_score: 0.6,
            summary: '금능 해수욕장',
            extraction_confidence: 0.9,
            verification_status: 'verified_naver',
          },
        };
      }),
    };

    const adapter = new LlmExtractorAdapter(mockProvider, {
      kakaoSearch: mockKakaoSearch,
      naverSearch: mockNaverSearch,
    });
    const result = await adapter.extract({ snippet: '금능 바다 추천...', query: '제주 해수욕장' });

    expect(result.spot_name).toBe('금능해수욕장');
    expect(result.verification_status).toBe('verified_naver');
    expect(mockKakaoSearch).toHaveBeenCalledWith('금능');
    expect(mockNaverSearch).toHaveBeenCalledWith('금능해수욕장');
  });
});
