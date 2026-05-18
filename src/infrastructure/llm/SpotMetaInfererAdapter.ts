import Anthropic from '@anthropic-ai/sdk';
import type { SpotMetaInfererPort, SpotMetaInferInput, SpotMetaInference } from '../../application/ports/SpotMetaInfererPort.js';

export class SpotMetaInfererError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SpotMetaInfererError';
  }
}

const INFER_TOOL: Anthropic.Tool = {
  name: 'infer_spot_meta',
  description: '비짓제주 장소 소개 텍스트에서 4가지 메타 정보를 추론합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      atmosphere: { type: 'string', description: '분위기 묘사 (20자 이내)' },
      crowd_level: { type: 'string', description: '혼잡도 추정 (20자 이내)' },
      best_time: { type: 'string', description: '추천 방문 시간대 (20자 이내)' },
      target_visitor: { type: 'string', description: '주요 방문객 특성 (30자 이내)' },
    },
    required: ['atmosphere', 'crowd_level', 'best_time', 'target_visitor'],
  },
};

export class SpotMetaInfererAdapter implements SpotMetaInfererPort {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '' });
  }

  async infer(input: SpotMetaInferInput): Promise<SpotMetaInference> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        tools: [INFER_TOOL],
        tool_choice: { type: 'tool', name: 'infer_spot_meta' },
        messages: [
          {
            role: 'user',
            content: `장소명: ${input.name}\n소개: ${input.introduction}\n태그: ${input.tags}\n\n위 장소의 메타 정보를 추론하세요.`,
          },
        ],
      });
    } catch (err) {
      throw new SpotMetaInfererError('SpotMetaInferer API call failed', err);
    }

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new SpotMetaInfererError('SpotMetaInferer did not return tool_use block');
    }

    const raw = toolBlock.input as SpotMetaInference;
    return {
      atmosphere: raw.atmosphere,
      crowd_level: raw.crowd_level,
      best_time: raw.best_time,
      target_visitor: raw.target_visitor,
    };
  }
}
