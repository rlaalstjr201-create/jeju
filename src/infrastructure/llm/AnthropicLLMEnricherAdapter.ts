import Anthropic from '@anthropic-ai/sdk';
import type { LLMEnricherPort } from '../../application/ports/LLMEnricherPort.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';

export class AnthropicLLMEnricherAdapter implements LLMEnricherPort {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '',
    });
  }

  async enrich(
    candidate: CurationCandidate,
  ): Promise<{ summary: string; tags: string[]; priceRange: string | null }> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `제주도 여행지 정보를 한국어로 요약해주세요.
장소명: ${candidate.name}
지역: ${candidate.region}
카테고리: ${candidate.category}

응답은 반드시 아래 JSON 형식으로만 답하세요:
{"summary":"2문장 한국어 요약","tags":["태그1","태그2","태그3"],"priceRange":"free|budget|mid|high|null"}

priceRange는 카테고리와 장소명 기반으로 추정하되, 모르면 null로.`,
        },
      ],
    });

    const content = response.content[0];
    if (content?.type !== 'text') {
      throw new Error('LLM returned unexpected response type');
    }

    const match = content.text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('LLM response did not contain valid JSON');
    }

    const jsonStr = match[0];
    if (jsonStr === undefined) {
      throw new Error('LLM response JSON extraction failed');
    }

    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
      tags?: string[];
      priceRange?: string | null;
    };

    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.tags)) {
      throw new Error('LLM response missing required fields');
    }

    // Cost tracking log
    console.log(
      JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCost: (response.usage.input_tokens * 0.00000025 + response.usage.output_tokens * 0.00000125).toFixed(6),
        candidateId: candidate.id,
      }),
    );

    return {
      summary: parsed.summary,
      tags: parsed.tags,
      priceRange: typeof parsed.priceRange === 'string' && parsed.priceRange !== 'null'
        ? parsed.priceRange
        : null,
    };
  }
}
