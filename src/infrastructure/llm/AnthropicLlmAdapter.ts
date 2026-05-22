import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmProviderPort,
  LlmProviderCallParams,
  LlmAgentParams,
  LlmAgentResult,
  LlmTool,
} from '../../application/ports/LlmProviderPort.js';

export class AnthropicLlmAdapterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnthropicLlmAdapterError';
  }
}

interface AnthropicLlmAdapterOptions {
  apiKey?: string;
  model?: string;
}

function toAnthropicTool(tool: LlmTool): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool['input_schema'],
  };
}

export class AnthropicLlmAdapter implements LlmProviderPort {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicLlmAdapterOptions = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '' });
    this.model = options.model ?? 'claude-haiku-4-5-20251001';
  }

  async callWithTool(params: LlmProviderCallParams): Promise<Record<string, unknown>> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: params.maxTokens,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        tools: [toAnthropicTool(params.tool)],
        tool_choice: { type: 'tool', name: params.tool.name },
        messages: [{ role: 'user', content: params.userMessage }],
      });
    } catch (err) {
      throw new AnthropicLlmAdapterError('Anthropic API call failed', err);
    }

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new AnthropicLlmAdapterError('LLM returned no tool_use block');
    }

    return toolBlock.input as Record<string, unknown>;
  }

  async callWithTools(params: LlmAgentParams): Promise<LlmAgentResult> {
    const maxIterations = params.maxIterations ?? 6;
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: params.userMessage },
    ];

    const tools = params.tools.map(toAnthropicTool);

    for (let i = 0; i < maxIterations; i++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: params.maxTokens,
          system: params.systemPrompt,
          tools,
          tool_choice: { type: 'auto' },
          messages,
        });
      } catch (err) {
        throw new AnthropicLlmAdapterError('Anthropic API call failed', err);
      }

      const toolBlock = response.content.find((b) => b.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        throw new AnthropicLlmAdapterError('LLM returned no tool_use block');
      }

      if (toolBlock.name === params.terminalToolName) {
        return {
          finalToolName: toolBlock.name,
          finalArgs: toolBlock.input as Record<string, unknown>,
        };
      }

      const toolResult = await params.onToolCall(
        toolBlock.name,
        toolBlock.input as Record<string, unknown>,
        toolBlock.id,
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolResult }],
      });
    }

    throw new AnthropicLlmAdapterError('Max iterations exceeded');
  }
}
