import type { LlmExtractorPort, LlmExtractionInput, LlmExtraction, SpotCategory, VerificationStatus, KakaoSearchHit, NaverSearchHit } from '../../application/ports/LlmExtractorPort.js';
import type { LlmProviderPort, LlmTool, LlmAgentParams } from '../../application/ports/LlmProviderPort.js';
import { isSubstantialMatch } from '../../application/curation/SpotNameMatcher.js';

export class LlmExtractorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LlmExtractorError';
  }
}

export interface LlmExtractorSearchDeps {
  kakaoSearch: (query: string) => Promise<KakaoSearchHit[]>;
  naverSearch: (query: string) => Promise<NaverSearchHit[]>;
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

const KOREAN_NULL_STRINGS = new Set(['null', '', '식별 불가', '불명', '알 수 없음', '미상', 'N/A']);

function isNullSpotName(v: unknown): boolean {
  return v == null || KOREAN_NULL_STRINGS.has(String(v));
}

// ---------------------------------------------------------------------------
// Single-call (v6) tool definition
// ---------------------------------------------------------------------------

const SINGLE_CALL_TOOL: LlmTool = {
  name: 'extract_spot',
  description: '네이버 블로그/카페 스니펫에서 제주 장소 정보를 구조화해 추출합니다.',
  parameters: {
    type: 'object',
    properties: {
      spot_name: {
        type: 'string',
        description: '장소명. 식별 불가하면 null.',
        nullable: true,
      },
      parent_spot_hint: {
        type: 'string',
        description: '상위 장소 힌트. 없으면 null.',
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

// ---------------------------------------------------------------------------
// Tool calling (v7) tool definitions
// ---------------------------------------------------------------------------

const SEARCH_KAKAO_TOOL: LlmTool = {
  name: 'search_kakao_local',
  description: 'Search Kakao Local for Jeju places. Returns up to 5 results with name, category, address, coordinates.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Korean place name or keyword to search' },
    },
    required: ['query'],
  },
};

const SEARCH_NAVER_TOOL: LlmTool = {
  name: 'search_naver_local',
  description: 'Search Naver Local for Jeju places. Use when Kakao returns 0 results.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Korean place name or keyword to search' },
    },
    required: ['query'],
  },
};

const EXTRACT_SPOT_TOOL: LlmTool = {
  name: 'extract_spot',
  description: 'Submit the final extraction result. Call this after verifying via search tools.',
  parameters: {
    type: 'object',
    properties: {
      spot_name: { type: 'string', nullable: true },
      parent_spot_hint: { type: 'string', nullable: true },
      category: { type: 'string', enum: ['natural', 'cafe', 'experience', 'restaurant', 'souvenir', 'other'] },
      authenticity_score: { type: 'number' },
      ordinariness_score: { type: 'number' },
      summary: { type: 'string', description: '1-line Korean summary, max 50 chars' },
      extraction_confidence: { type: 'number', description: '0.0-1.0, confidence in spot_name correctness' },
      verification_status: {
        type: 'string',
        enum: ['verified_kakao', 'verified_naver', 'parent_corrected', 'unverified'],
      },
    },
    required: ['category', 'authenticity_score', 'ordinariness_score', 'summary', 'extraction_confidence', 'verification_status'],
  },
};

const V7_SYSTEM_PROMPT = `You are an entity extraction agent for a Jeju Island travel curation pipeline.

Your workflow for EACH snippet:
1. Identify a candidate spot name (proper Korean noun — restaurant, café, natural site, etc.)
   Skip if: descriptive phrase, generic noun alone ('시골집', '중문'), brand name ('메종드백'), adjective-led phrase
2. Call search_kakao_local with the exact candidate name as written in the snippet
3. If Kakao returns a Jeju result: verified. Use the returned official name.
4. If Kakao returns 0 results: try a fuller/alternative form ONLY for natural sites and beaches (e.g. '금능' → '금능해수욕장'). NEVER shorten a restaurant/café/shop name to a geographic prefix (e.g. do NOT try '선흘곶' when '선흘곶식당' returned 0 results). Call search_kakao_local again with the alternative.
5. If still 0 Kakao results: MANDATORY — call search_naver_local. This step is REQUIRED and must NOT be skipped.
6. If all searches (Kakao + Naver) return 0 results: spot_name = null

IMPORTANT — ALWAYS call extract_spot as your final step, even when spot_name is null. NEVER respond with plain text — ALWAYS use a tool call.

Hallucination rule: NEVER invent or assume a spot exists. Verification via search is mandatory.
Brand rule: '메종드백', '탄산오름 음료', '가츠오 소스' are product brands, not spots — call extract_spot with spot_name: null immediately.
Generic rule: '시골집', '중문', '해변', '오름' alone are not spots — call extract_spot with spot_name: null immediately.
Ad rule: authenticity_score ≤ 0.4 if 체험단/협찬/광고/후원/인플루언서 signals present.
Location rule: If snippet's location is explicitly NOT Jeju (서울·부산·경기 etc., or foreign), call extract_spot with spot_name: null immediately.
Match validation rule: A search result is a valid match ONLY if the result name substantially matches the candidate name.
  - Searching '선흌곶식당' → Kakao returns '선흌곶' (a natural area): NOT a match. Treat as 0 results and proceed to Naver.
  - Searching '선흌곶식당' → Kakao returns '선흌곶식당': valid match.
  - The result name must not drop significant parts of the searched name (e.g., dropping '식당', '카페', '펜션' from a restaurant/café/accommodation name is invalid).
Name integrity rule: Use the spot name exactly as found in the verified search result. NEVER abbreviate or shorten it.

Examples (reasoning shown):
- "반빛당 카페..." → search_kakao('반빛당') → 0 results → search_naver('반빛당') → 0 results → extract_spot(spot_name: null)
- "금능 바다 추천..." → search_kakao('금능') → 0 results → search_kakao('금능해수욕장') → match → extract_spot(spot_name: "금능해수욕장", verified_kakao)
- "시골집 느낌 식당..." → generic noun → extract_spot(spot_name: null) immediately
- "선흘곶식당 입구가..." → search_kakao('선흘곶식당') → Jeju match → extract_spot(spot_name: "선흘곶식당", verified_kakao)
- "선흘곶식당 입구가..." → search_kakao('선흘곶식당') → 0 results → search_naver('선흘곶식당') → match → extract_spot(spot_name: "선흘곶식당", verified_naver)  [NEVER try '선흘곶' alone]
- "선흘곶식당 입구가..." → search_kakao('선흘곶식당') → 0 results → search_naver('선흘곶식당') → 0 results → extract_spot(spot_name: null)  [NEVER use '선흌곶']
- "메종드백 신상..." → brand → extract_spot(spot_name: null) immediately
- "외돌개뒷길 산책..." → search_kakao('외돌개뒷길') → 0 results → search_naver('외돌개뒷길') → 0 results → search_kakao('외돌개') → match → extract_spot(spot_name: "외돌개", parent_spot_hint: "외돌개")

Always end with a call to extract_spot.`;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class LlmExtractorAdapter implements LlmExtractorPort {
  constructor(
    private readonly provider: LlmProviderPort,
    private readonly searchDeps?: LlmExtractorSearchDeps,
  ) {}

  async extract(input: LlmExtractionInput): Promise<LlmExtraction> {
    if (this.searchDeps) {
      return this.extractWithToolCalling(input);
    }
    return this.extractSingleCall(input);
  }

  private async extractSingleCall(input: LlmExtractionInput): Promise<LlmExtraction> {
    let raw: Record<string, unknown>;
    try {
      raw = await this.provider.callWithTool({
        userMessage: `검색 쿼리: ${input.query}\n\n스니펫:\n${input.snippet}\n\n위 내용에서 제주 장소 정보를 추출하세요.`,
        tool: SINGLE_CALL_TOOL,
        maxTokens: 256,
      });
    } catch (err) {
      throw new LlmExtractorError('LLM API call failed', err);
    }

    return this.parseExtractionResult(raw, true);
  }

  private async extractWithToolCalling(input: LlmExtractionInput): Promise<LlmExtraction> {
    const userMessage = `Search query: ${input.query}\n\nSnippet:\n${input.snippet}`;

    let result;
    try {
      result = await this.provider.callWithTools({
        systemPrompt: V7_SYSTEM_PROMPT,
        userMessage,
        tools: [SEARCH_KAKAO_TOOL, SEARCH_NAVER_TOOL, EXTRACT_SPOT_TOOL],
        terminalToolName: 'extract_spot',
        onToolCall: async (name: string, args: Record<string, unknown>) => {
          if (name === 'search_kakao_local') {
            const query = args['query'] as string;
            const hits = await this.searchDeps!.kakaoSearch(query);
            const matched = hits.filter((h) => isSubstantialMatch(query, h.name)).slice(0, 5);
            return JSON.stringify({ results: matched });
          }
          if (name === 'search_naver_local') {
            const query = args['query'] as string;
            const hits = await this.searchDeps!.naverSearch(query);
            const matched = hits.filter((h) => isSubstantialMatch(query, h.name)).slice(0, 5);
            return JSON.stringify({ results: matched });
          }
          return JSON.stringify({ error: 'unknown tool' });
        },
        maxIterations: 8,
        maxTokens: 512,
      });
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('no tool_calls') ||
        err.message.includes('Max iterations exceeded')
      )) {
        return this.nullExtraction();
      }
      throw err;
    }

    return this.parseExtractionResult(result.finalArgs, false);
  }

  private nullExtraction(): LlmExtraction {
    return {
      spot_name: null,
      parent_spot_hint: null,
      category: 'other',
      authenticity_score: 0.5,
      ordinariness_score: 0.5,
      summary: '',
      extraction_confidence: 0,
      verification_status: 'unverified',
    };
  }

  private parseExtractionResult(raw: Record<string, unknown>, isSingleCall: boolean): LlmExtraction {
    const spotName = raw['spot_name'];
    const parentHint = raw['parent_spot_hint'];
    const verificationStatus: VerificationStatus = isSingleCall
      ? 'unverified'
      : ((raw['verification_status'] as VerificationStatus) ?? 'unverified');
    const extractionConfidence: number = isSingleCall
      ? 1.0
      : clamp(Number(raw['extraction_confidence'] ?? 1.0));

    return {
      spot_name: isNullSpotName(spotName) ? null : String(spotName),
      parent_spot_hint: isNullSpotName(parentHint) ? null : String(parentHint),
      category: toCategory(raw['category'] as string),
      authenticity_score: clamp(Number(raw['authenticity_score'] ?? 0.5)),
      ordinariness_score: clamp(Number(raw['ordinariness_score'] ?? 0.5)),
      summary: String(raw['summary'] ?? ''),
      extraction_confidence: extractionConfidence,
      verification_status: verificationStatus,
    };
  }
}
