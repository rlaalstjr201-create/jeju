import type {
  LlmProviderPort,
  LlmProviderCallParams,
  LlmAgentParams,
  LlmAgentResult,
  LlmTool,
} from '../../application/ports/LlmProviderPort.js';

export class OpenRouterLlmAdapterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OpenRouterLlmAdapterError';
  }
}

interface OpenRouterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenRouterMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
}

interface OpenRouterResponse {
  choices: Array<{ message: OpenRouterMessage }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function toOpenRouterTool(tool: LlmTool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export class OpenRouterLlmAdapter implements LlmProviderPort {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OpenRouterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://openrouter.ai/api';
  }

  async callWithTool(params: LlmProviderCallParams): Promise<Record<string, unknown>> {
    const messages: Array<{ role: string; content: string }> = [];
    if (params.systemPrompt) {
      messages.push({ role: 'system', content: params.systemPrompt });
    }
    messages.push({ role: 'user', content: params.userMessage });

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: params.maxTokens,
          messages,
          tools: [toOpenRouterTool(params.tool)],
          tool_choice: { type: 'function', function: { name: params.tool.name } },
        }),
      });
    } catch (err) {
      throw new OpenRouterLlmAdapterError('OpenRouter API network error', err);
    }

    if (!res.ok) {
      throw new OpenRouterLlmAdapterError(`OpenRouter API returned ${res.status}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new OpenRouterLlmAdapterError('LLM returned no tool_calls');
    }

    return JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  }

  async callWithTools(params: LlmAgentParams): Promise<LlmAgentResult> {
    const maxIterations = params.maxIterations ?? 6;
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userMessage },
    ];

    const tools = params.tools.map(toOpenRouterTool);

    for (let i = 0; i < maxIterations; i++) {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: params.maxTokens,
            messages,
            tools,
            tool_choice: 'auto',
          }),
        });
      } catch (err) {
        throw new OpenRouterLlmAdapterError('OpenRouter API network error', err);
      }

      if (!res.ok) {
        throw new OpenRouterLlmAdapterError(`OpenRouter API returned ${res.status}`);
      }

      const data = (await res.json()) as OpenRouterResponse;
      const message = data.choices[0]?.message;
      const toolCall = message?.tool_calls?.[0];

      if (!toolCall) {
        throw new OpenRouterLlmAdapterError('LLM returned no tool_calls');
      }

      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

      if (toolName === params.terminalToolName) {
        return { finalToolName: toolName, finalArgs: toolArgs };
      }

      const toolResult = await params.onToolCall(toolName, toolArgs, toolCall.id);

      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [toolCall],
      });
      messages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      });
    }

    throw new OpenRouterLlmAdapterError('Max iterations exceeded');
  }
}
