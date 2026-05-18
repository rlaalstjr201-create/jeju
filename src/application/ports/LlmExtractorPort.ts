export type SpotCategory =
  | 'natural'
  | 'cafe'
  | 'experience'
  | 'restaurant'
  | 'souvenir'
  | 'other';

export interface LlmExtractionInput {
  readonly snippet: string; // 네이버 description (HTML 태그 제거 후)
  readonly query: string;   // 원본 검색 쿼리 (컨텍스트용)
}

export interface LlmExtraction {
  readonly spot_name: string | null; // 식별 불가면 null
  readonly category: SpotCategory;
  readonly authenticity_score: number; // 0.0–1.0, 높을수록 광고 아님
  readonly ordinariness_score: number; // 0.0–1.0, 높을수록 패키지 여행 뻔한 곳
  readonly summary: string;            // 1줄, 50자 이내
}

export interface LlmExtractorPort {
  extract(input: LlmExtractionInput): Promise<LlmExtraction>;
}
