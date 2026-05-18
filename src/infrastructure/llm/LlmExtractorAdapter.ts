import Anthropic from '@anthropic-ai/sdk';
import type { LlmExtractorPort, LlmExtractionInput, LlmExtraction, SpotCategory } from '../../application/ports/LlmExtractorPort.js';

export class LlmExtractorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LlmExtractorError';
  }
}

const VALID_CATEGORIES = new Set<SpotCategory>([
  'natural', 'cafe', 'experience', 'restaurant', 'souvenir', 'other',
]);

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toCategory(raw: string): SpotCategory {
  return VALID_CATEGORIES.has(raw as SpotCategory) ? (raw as SpotCategory) : 'other';
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_spot',
  description: '네이버 블로그/카페 스니펫에서 제주 장소 정보를 구조화해 추출합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      spot_name: {
        type: 'string',
        description: '장소명. 식별 불가하면 null.',
        nullable: true,
      },
      category: {
        type: 'string',
        enum: ['natural', 'cafe', 'experience', 'restaurant', 'souvenir', 'other'],
        description: '장소 카테고리',
      },
      authenticity_score: {
        type: 'number',
        description: '0.0–1.0. 1에 가까울수록 광고 아님, 진정성 높음.',
      },
      ordinariness_score: {
        type: 'number',
        description: '0.0–1.0. 1에 가까울수록 패키지 여행에서 뻔한 관광지.',
      },
      summary: {
        type: 'string',
        description: '50자 이내 1줄 한국어 요약.',
      },
    },
    required: ['category', 'authenticity_score', 'ordinariness_score', 'summary'],
  },
};

export class LlmExtractorAdapter implements LlmExtractorPort {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '' });
  }

  async extract(input: LlmExtractionInput): Promise<LlmExtraction> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_spot' },
        messages: [
          {
            role: 'user',
            content: `검색 쿼리: ${input.query}\n\n스니펫:\n${input.snippet}\n\n위 내용에서 제주 장소 정보를 추출하세요.`,
          },
        ],
      });
    } catch (err) {
      throw new LlmExtractorError('LLM API call failed', err);
    }

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new LlmExtractorError('LLM did not return tool_use block');
    }

    const raw = toolBlock.input as {
      spot_name?: string | null;
      category: string;
      authenticity_score: number;
      ordinariness_score: number;
      summary: string;
    };

    return {
      spot_name: raw.spot_name ?? null,
      category: toCategory(raw.category),
      authenticity_score: clamp(raw.authenticity_score),
      ordinariness_score: clamp(raw.ordinariness_score),
      summary: raw.summary,
    };
  }
}
