# ADR-0028: LLM-Augmented Embedding — Phase 0 1회 배치

Status: Accepted (2026-05-19)

## Context

ADR-0004에서 embedding 용도는 "semantic 검색 + 유사 Spot 찾기"로 정의됐으나, v1 기본 추천에는 미사용이며 인프라만 준비된 상태다.

비짓제주 `introduction` 필드는 짧고 사실 위주다 (예: "수성화산·유네스코 세계자연유산, 천연기념물 제420호"). 사용자 자연어 질의(예: "한적한 오름")와 의미적 정렬이 부족해 raw text 그대로 embedding하면 semantic 검색 품질이 낮다.

ACM RecSys 2025 연구 결과: LLM이 메타데이터로부터 풍부한 텍스트를 생성한 뒤 embedding하면 추천 정확도가 유의미하게 향상된다.

ADR-0017 수동 trigger 정책과의 정합도 요건이다. v1은 큐레이터 1인 정책으로 자동 cron을 두지 않는다.

## Decision

- **Phase 0 자동 수집 직후 LLM-Augmented Embedding 배치 1회 실행**.
- **흐름**:
  1. 비짓제주 raw `introduction` + tag → 입력
  2. LLM (Claude claude-opus-4-7)이 *분위기·고객층·시간대·포화도* 추론 → JSON 출력
  3. 원본 텍스트 + LLM 추론 텍스트 concat → Voyage AI embedding 생성
  4. `spots.embedding` 컬럼 저장
- **비용 한정**: 200개 × $0.01~0.02 ≒ 약 $3
- **실행 방식**: 수동 trigger만 (`npm run embed:batch`). 자동 cron 없음.
- **신규 Spot**: 추가 시 동일 prompt로 1개씩 개별 호출.

## Consequences

**Positive:**
- "한적한 오름" 같은 자연어 질의와의 의미적 정렬이 개선된다.
- ADR-0004 embedding 용도와 정합하며 인프라를 실질 활성화한다.
- 큐레이터 검토 시 AI 보조 메타를 참고 자료로 제공한다 (결정 권한은 큐레이터).
- v2 진입 시 사용자 검색 history와 동일 embedding 공간을 공유 → Collaborative Filtering 학습이 자연스럽게 연결된다.

**Negative / Risk:**
- LLM 추론이 비짓제주 raw 데이터와 불일치할 위험 (예: 분위기·혼잡도는 LLM 추측). 큐레이터 UI에서 raw + LLM 추론 둘 다 표시해 큐레이터가 검증하도록 한다 (ADR-0027 큐레이터 UI와 연계).
- LLM enrichment는 수동 trigger 정책이므로 신규 Spot 대량 유입 시 배치 재실행이 수동 작업이다. v2 다중 큐레이터 시점에 자동 cron 검토.

## Alternatives Considered

**raw introduction만 embedding:** 기각.
- 비짓제주 텍스트가 짧고 사실 위주여서 semantic 검색 품질이 낮다. 자연어 질의와의 의미적 정렬을 확보하지 못한다.

**LLM 자동 cron 배치:** 기각.
- ADR-0017 수동 trigger 정책과 충돌한다. v1 큐레이터 1인 정책 하에서 무감독 자동화는 thesis 검증 체계를 우회한다.

**사용자 query 시점 LLM 호출 (on-the-fly):** 기각.
- 응답 지연·비용이 폭증한다. 사전 배치(offline enrichment)가 추천 시스템 표준 패턴이다.

## References

- ADR-0004: Spot Embedding Infrastructure Only
- ADR-0017: Two-Track Recommendation (LLM 발굴 수동 trigger 정책)
- ADR-0023: 비짓제주 1차 채택
- ADR-0027: HITL 큐레이터 워크플로우 + 진화 단계 명시
