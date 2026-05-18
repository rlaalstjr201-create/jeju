# ADR-0029: Phase 0 hidden gem 자동 발굴 파이프라인

Status: Accepted (2026-05-19)

## Context

사용자 thesis 본질은 "광고에 가려진 hidden gem 자동 발굴"이다. v1에서 큐레이터 1인이 후보 검토를 본업으로 하되, *후보 발굴* 자체는 자동화해야 한다. 비짓제주만으로는 등록된 유명 관광지만 포착된다 — 비짓제주 미등록 카페·체험·자연 spot이 thesis의 실질 대상이다.

실측 검증 결과:
- 네이버 블로그·카페 검색 API: 합법 OpenAPI, 일 25,000회, 키워드 기반 장소 언급 탐색 가능
- 카카오 로컬 API: 좌표·실재 검증 일 100,000건
- 인스타·유튜브 API: TOS·quota 제약 (별도 항 기각)
- 네이버 플레이스 스크래핑: 대법원 판례 위반 위험

## Decision

**Phase 0 자동 hidden gem 발굴 파이프라인 5단계**:

```
1. 비짓제주 API
   → base layer. 등록 관광지 시드 + 비짓제주 없는 spot 비교 기준

2. 네이버 블로그·카페 검색 API
   · long-tail 쿼리 50개 (큐레이터가 직접 설계)
     예: "제주 한경면 카페", "우도 숨은 맛집", "제주 체험 비추천 이유는"
   · 일 1,000~5,000건 수집 (한도 25,000 내 여유)
   · 자연·체험·카페·식당·기념품 카테고리 모두 커버

3. Claude API (structured output, Pydantic)
   · 블로그 snippet → 다음 필드 추출:
     - spot_name (추정 명칭)
     - category (자연·카페·체험·식당·기타)
     - authenticity_score (0~1, 광고성 탐지)
     - ordinariness_score (0~1, 뻔함 정도 — 여행사 패키지 키워드 cosine 유사도)
     - summary (1줄)
   · 진정성 점수 prompt: Zarei et al. ASONAM 2020 광고 탐지 신호 차용
   · 뻔함 점수: "성산일출봉", "흑돼지거리" 등 패키지 키워드 임베딩 centroid 거리

4. 카카오 로컬 API
   · spot_name 키워드 검색 → 좌표·주소 반환
   · 실재 검증 (실제 영업 장소인지)
   · 비짓제주 좌표와 비교해 중복 제거

5. dedup + CurationCandidate 테이블 저장
   · 동일 좌표 반경 100m 내 중복 제거
   · 큐레이터 검토 대기열에 enqueue
```

**LLM 사전 점수의 역할**:
- 큐레이터에게 *참고용*. 자동 ranking 결정 X (ADR-0026 정합).
- 큐레이터 검토 UI에 authenticity·ordinariness 점수 표시 → 5분/30개 검토 가속 목표.

**rate limit 정책**:
- 네이버 검색 API: 일 25,000회 (블로그·카페 각각 별도 한도 가능 — 1차 확인 후 조정)
- 카카오 로컬 API: 일 100,000건
- Claude API: Anthropic 표준 사용량 기반

**long-tail 쿼리 50개 설계는 큐레이터(너)가 직접** — thesis 정합 핵심 단계. 자동 생성 X.

## Consequences

**Positive:**
- 비짓제주 미등록 hidden gem 자동 발굴 — thesis 본질 작동.
- 모든 카테고리 커버 (자연·체험·카페·식당·기념품).
- 합법 (공식 API + structured output — raw 크롤링 X).
- LLM 사전 점수로 큐레이터 검토 부담 절반 수준으로 감소 목표.

**Negative / Risk:**
- 광고 블로그 노이즈 처리는 LLM 진정성 점수에 의존 — 정확도 한계 있음 (Bertaglia 2024).
- 네이버 검색은 snippet만 제공 (본문 전체 X) → 일부 컨텍스트 손실.
- long-tail 쿼리 50개 설계는 큐레이터 직접 작업 — thesis 정합이나 1회성 비용 발생.

## Alternatives Considered

**인스타·유튜브 API 활용:** 기각.
- Meta 2020.6 hashtag search API 제약. YouTube quota 10,000 units/일 (검색 100건/일 환산). 1인 4개월 마감에 비현실적.

**네이버 플레이스 스크래핑:** 기각.
- 잡코리아 vs 사람인 사건(대법원 2025) 등 판례 위반 위험. 약관 위반.

**카카오 로컬 API 단독:** 기각.
- 키워드 검색만 가능. 진정성·hidden gem 신호 없음.

**사용자 행동 데이터 기반 발굴:** 기각.
- cold-start 단계라 데이터 0.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0017: LLM 발굴 수동 trigger 정책
- ADR-0024 수정: 4슬롯 모델 (네이버 검색 API DISCOVERY 슬롯)
- ADR-0026 재작성: LLM 사전 점수 = 참고용 (ranking 결정 X)
- Zarei et al. "Characterising and Detecting Sponsored Influencer Posts" (ASONAM 2020, arXiv:2011.05757)
- Bertaglia et al. "InstaSynth" (ICWSM 2024)
