export type SpotCategory =
  | 'natural'
  | 'cafe'
  | 'experience'
  | 'restaurant'
  | 'souvenir'
  | 'other';

export type VerificationStatus = 'verified_kakao' | 'verified_naver' | 'parent_corrected' | 'unverified';

export interface LlmExtractionInput {
  readonly snippet: string; // 네이버 description (HTML 태그 제거 후)
  readonly query: string;   // 원본 검색 쿼리 (컨텍스트용)
}

export interface LlmExtraction {
  readonly spot_name: string | null; // 식별 불가면 null
  readonly parent_spot_hint: string | null;
  readonly category: SpotCategory;
  readonly authenticity_score: number; // 0.0–1.0, 높을수록 광고 아님
  readonly ordinariness_score: number; // 0.0–1.0, 높을수록 패키지 여행 뻔한 곳
  readonly summary: string;            // 1줄, 50자 이내
  readonly extraction_confidence: number;     // 0-1
  readonly verification_status: VerificationStatus;
}

export interface KakaoSearchHit {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

export interface NaverSearchHit {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
}

export interface LlmExtractorPort {
  extract(input: LlmExtractionInput): Promise<LlmExtraction>;
}
