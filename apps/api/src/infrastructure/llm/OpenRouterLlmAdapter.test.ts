import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { OpenRouterLlmAdapter, OpenRouterLlmAdapterError } from './OpenRouterLlmAdapter.js';
import type { LlmTool } from '../../application/ports/LlmProviderPort.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE_URL = 'https://openrouter.ai/api';
const ENDPOINT = `${BASE_URL}/v1/chat/completions`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXTRACT_TOOL: LlmTool = {
  name: 'extract_spot',
  description: 'Extract spot info',
  parameters: {
    type: 'object',
    properties: { spot_name: { type: 'string' } },
    required: ['spot_name'],
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

function makeToolCallResponse(toolName: string, toolArgs: Record<string, unknown>, callId = 'call_1') {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: callId,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(toolArgs) },
        }],
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

// ---------------------------------------------------------------------------
// callWithTool tests
// ---------------------------------------------------------------------------

describe('OpenRouterLlmAdapter.callWithTool', () => {
  it('calls API and returns parsed tool args', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json(makeToolCallResponse('extract_spot', { spot_name: '테스트 카페' }))),
    );

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
    const result = await adapter.callWithTool({
      userMessage: 'test snippet',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    });

    expect(result['spot_name']).toBe('테스트 카페');
  });

  it('throws OpenRouterLlmAdapterError on non-ok response', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
    );

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'bad-key', model: 'test-model', baseUrl: BASE_URL });
    await expect(adapter.callWithTool({
      userMessage: 'test',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(OpenRouterLlmAdapterError);
  });

  it('throws OpenRouterLlmAdapterError when no tool_calls in response', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({
        choices: [{ message: { role: 'assistant', content: 'sorry' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })),
    );

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
    await expect(adapter.callWithTool({
      userMessage: 'test',
      tool: EXTRACT_TOOL,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(OpenRouterLlmAdapterError);
  });
});

// ---------------------------------------------------------------------------
// callWithTools tests
// ---------------------------------------------------------------------------

describe('OpenRouterLlmAdapter.callWithTools', () => {
  it('2-turn loop: search → extract_spot → returns final result', async () => {
    let callCount = 0;
    server.use(
      http.post(ENDPOINT, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(makeToolCallResponse('search_kakao_local', { query: '선흘곶식당' }, 'call_1'));
        }
        return HttpResponse.json(makeToolCallResponse('extract_spot', {
          spot_name: '선흘곶식당', category: 'restaurant', authenticity_score: 0.9,
          ordinariness_score: 0.2, summary: '숨은 식당', extraction_confidence: 0.95,
          verification_status: 'verified_kakao',
        }, 'call_2'));
      }),
    );

    const onToolCall = vi.fn().mockResolvedValue(JSON.stringify({ results: [{ name: '선흘곶식당', category: '한식', address: '제주시' }] }));

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
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
    expect(callCount).toBe(2);
    expect(onToolCall).toHaveBeenCalledOnce();
    expect(onToolCall).toHaveBeenCalledWith('search_kakao_local', { query: '선흘곶식당' }, 'call_1');
  });

  it('maxIterations exceeded → throws OpenRouterLlmAdapterError', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json(makeToolCallResponse('search_kakao_local', { query: '테스트' }))),
    );

    const onToolCall = vi.fn().mockResolvedValue('{}');

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
    await expect(adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: 'user',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall,
      maxIterations: 2,
      maxTokens: 256,
    })).rejects.toBeInstanceOf(OpenRouterLlmAdapterError);
  });

  it('no tool_calls in response → throws OpenRouterLlmAdapterError', async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({
        choices: [{ message: { role: 'assistant', content: 'no tools' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })),
    );

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
    await expect(adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: 'user',
      tools: [SEARCH_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall: vi.fn(),
      maxTokens: 256,
    })).rejects.toBeInstanceOf(OpenRouterLlmAdapterError);
  });

  it('onToolCall receives correct name and args', async () => {
    let callCount = 0;
    server.use(
      http.post(ENDPOINT, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(makeToolCallResponse('search_naver_local', { query: '금능해수욕장' }, 'call_nav_1'));
        }
        return HttpResponse.json(makeToolCallResponse('extract_spot', {
          spot_name: '금능해수욕장', category: 'natural', authenticity_score: 0.85,
          ordinariness_score: 0.6, summary: '금능 해수욕장', extraction_confidence: 0.9,
          verification_status: 'verified_naver',
        }, 'call_nav_2'));
      }),
    );

    const onToolCall = vi.fn().mockResolvedValue(JSON.stringify({ results: [{ name: '금능해수욕장' }] }));

    const NAVER_TOOL: LlmTool = {
      name: 'search_naver_local',
      description: 'Search Naver',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    };

    const adapter = new OpenRouterLlmAdapter({ apiKey: 'test-key', model: 'test-model', baseUrl: BASE_URL });
    await adapter.callWithTools({
      systemPrompt: 'system',
      userMessage: '금능 바다',
      tools: [NAVER_TOOL, EXTRACT_TOOL],
      terminalToolName: 'extract_spot',
      onToolCall,
      maxTokens: 512,
    });

    expect(onToolCall).toHaveBeenCalledWith('search_naver_local', { query: '금능해수욕장' }, 'call_nav_1');
  });
});
