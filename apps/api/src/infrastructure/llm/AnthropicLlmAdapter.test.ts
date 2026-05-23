import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicLlmAdapter, AnthropicLlmAdapterError } from './AnthropicLlmAdapter.js';
import type { LlmTool } from '../../application/ports/LlmProviderPort.js';

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

beforeEach(() => {
  mockCreate.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXTRACT_TOOL: LlmTool = {
  name: 'extract_spot',
  description: 'Extract spot',
  parameters: {
    type: 'object',
    properties: { spot_name: { type: 'string' }, category: { type: 'string' } },
    required: ['spot_name', 'category'],
  },
};

const SEARCH_TOOL: LlmTool = {
  name: 'search_kakao_local',
  description: 'Search Kakao',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

function makeToolUseResponse(toolName: string, input: Record<string, unknown>, toolId = 'toolu_01') {
  return {
    content: [{ type: 'tool_use', id: toolId, name: toolName, input }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// ---------------------------------------------------------------------------
// callWithTool tests
// ---------------------------------------------------------------------------

describe('AnthropicLlmAdapter.callWithTool', () => {
  it('returns parsed tool args from tool_use block', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse('extract_spot', { spot_name: '만장굴', category: 'natural' }));

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    const result = await adapter.callWithTool({
      userMessage: 'test snippet',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    });

    expect(result['spot_name']).toBe('만장굴');
    expect(result['category']).toBe('natural');
  });

  it('throws AnthropicLlmAdapterError when no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }], usage: {} });

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    await expect(adapter.callWithTool({
      userMessage: 'test',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(AnthropicLlmAdapterError);
  });

  it('throws AnthropicLlmAdapterError on API error', async () => {
    mockCreate.mockRejectedValue(new Error('API timeout'));

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    await expect(adapter.callWithTool({
      userMessage: 'test',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(AnthropicLlmAdapterError);
  });
});

// ---------------------------------------------------------------------------
// callWithTools tests
// ---------------------------------------------------------------------------

describe('AnthropicLlmAdapter.callWithTools', () => {
  it('2-turn: search_kakao → extract_spot → returns final result', async () => {
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse('search_kakao_local', { query: '선흘곶식당' }, 'toolu_search_1'))
      .mockResolvedValueOnce(makeToolUseResponse('extract_spot', {
        spot_name: '선흘곶식당', category: 'restaurant', authenticity_score: 0.9,
        ordinariness_score: 0.2, summary: '숨은 식당', extraction_confidence: 0.95,
        verification_status: 'verified_kakao',
      }, 'toolu_extract_1'));

    const onToolCall = vi.fn().mockResolvedValue(JSON.stringify({ results: [{ name: '선흘곶식당' }] }));

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    const result = await adapter.callWithTools({
      systemPrompt: 'You are an extractor.',
      userMessage: '선흘곶식당 입구가 숨어있는...',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall,
      maxTokens: 512,
    });

    expect(result.finalToolName).toBe('extract_spot');
    expect(result.finalArgs['spot_name']).toBe('선흘곶식당');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onToolCall).toHaveBeenCalledWith('search_kakao_local', { query: '선흘곶식당' }, 'toolu_search_1');
  });

  it('maxIterations exceeded → throws AnthropicLlmAdapterError', async () => {
    mockCreate.mockResolvedValue(makeToolUseResponse('search_kakao_local', { query: '테스트' }));

    const onToolCall = vi.fn().mockResolvedValue('{}');

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    await expect(adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: 'user',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall,
      maxIterations: 2,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(AnthropicLlmAdapterError);
  });

  it('no tool_use block → throws AnthropicLlmAdapterError', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'no tool' }], usage: {} });

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    await expect(adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: 'user',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall: vi.fn(),
      maxTokens: 256,
    })).rejects.toBeInstanceOf(AnthropicLlmAdapterError);
  });

  it('onToolCall receives correct args in 2-turn scenario', async () => {
    mockCreate
      .mockResolvedValueOnce(makeToolUseResponse('search_kakao_local', { query: '금능해수욕장' }, 'toolu_s'))
      .mockResolvedValueOnce(makeToolUseResponse('extract_spot', {
        spot_name: '금능해수욕장', category: 'natural', authenticity_score: 0.8,
        ordinariness_score: 0.5, summary: '금능 해수욕장', extraction_confidence: 0.9,
        verification_status: 'verified_kakao',
      }, 'toolu_e'));

    const onToolCall = vi.fn().mockResolvedValue(JSON.stringify({ results: [] }));

    const adapter = new AnthropicLlmAdapter({ apiKey: 'test-key' });
    await adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: '금능 바다',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall,
      maxTokens: 512,
    });

    expect(onToolCall).toHaveBeenCalledWith('search_kakao_local', { query: '금능해수욕장' }, 'toolu_s');
  });
});
