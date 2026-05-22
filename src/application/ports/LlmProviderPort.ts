export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmProviderCallParams {
  systemPrompt?: string;
  userMessage: string;
  tool: LlmTool;
  maxTokens: number;
}

export interface LlmAgentParams {
  systemPrompt: string;
  userMessage: string;
  tools: LlmTool[];
  terminalToolName: string;
  onToolCall: (name: string, args: Record<string, unknown>, toolCallId: string) => Promise<string>;
  maxIterations?: number;
  maxTokens: number;
}

export interface LlmAgentResult {
  finalToolName: string;
  finalArgs: Record<string, unknown>;
}

export interface LlmProviderPort {
  callWithTool(params: LlmProviderCallParams): Promise<Record<string, unknown>>;
  callWithTools(params: LlmAgentParams): Promise<LlmAgentResult>;
}
