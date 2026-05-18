export interface SpotMetaInferInput {
  readonly name: string;
  readonly introduction: string; // 비짓제주 raw introduction
  readonly tags: string;         // 비짓제주 tag (comma-separated)
}

export interface SpotMetaInference {
  readonly atmosphere: string;     // 분위기 묘사
  readonly crowd_level: string;    // 혼잡도 추정
  readonly best_time: string;      // 추천 시간대
  readonly target_visitor: string; // 고객층 묘사
}

export interface SpotMetaInfererPort {
  infer(input: SpotMetaInferInput): Promise<SpotMetaInference>;
}
