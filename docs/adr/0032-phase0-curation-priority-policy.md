# ADR-0032 — Phase 0 큐레이션 우선순위 정책

**날짜**: 2026-05-19  
**상태**: 결정됨

## 컨텍스트

H3+ 풀런 완료 후 큐레이터 검토 큐 규모:
- visitjeju: 3,712건 (pending 2,044 + kakao_unverified 1,655 + rejected 13)
- naver: 1,649건 (pending 258 + kakao_unverified 1,348 + rejected 43)
- 합계 5,361건 — 큐레이터 1인이 전량 검토하는 것은 비현실적.

ADR-0025 결정: "thesis 정렬 50개 > 평균 200개". 따라서 검토 대상 선별이 필요.

## 결정

### 1. visitjeju 후보 검토 제외 (v1)
visitjeju 후보는 큐레이션 검토 대상에서 제외한다.

근거:
- visitjeju는 이미 공개된 등록 관광지 — thesis(hidden gem) 대상이 아님.
- dedup 기준점(좌표 baseline) 역할은 유지. `review_excluded=true`로 표시.
- v1.5에서 재평가 가능 (ADR-0025 "200건 ceiling" 참조).

구현: `curation_candidates.review_excluded BOOLEAN NOT NULL DEFAULT FALSE`  
visitjeju source_type 전체 → `review_excluded=true` 일괄 업데이트.

### 2. naver 후보 검토 순서

필터: `source_type='naver' AND review_excluded=false AND status IN ('pending', 'kakao_unverified')`

정렬:
1. `ordinariness_score ASC NULLS LAST` — 낮을수록 hidden gem (thesis 정렬 1순위)
2. `authenticity_score DESC NULLS LAST` — 높을수록 진짜 후기
3. `status='pending' FIRST` — Kakao 매칭된 후보 우선 (큐레이터 검증 부담 분산)

### 3. 알파 50건 기준

ADR-0025 재확인: approve 50건 도달 시 v1 큐레이션 중단 가능.  
큐레이터는 reject를 적극 사용하되, 50건 approve 달성 시 추가 검토 불필요.

## 근거

- ADR-0025: thesis 정렬 우선, 수량 KPI 없음
- H3+ 결과: naver 1,649건이 hidden gem 표적. visitjeju는 유명 관광지 비율 높음
- ordinariness ASC: 파이프라인 설계(ADR-0029) 상 낮은 뻔함 = 숨은 보석 후보
- pending 우선: 좌표·Kakao ID 확보 → ApproveCandidateUseCase 즉시 실행 가능

## 영향

- Migration 014: `review_excluded BOOLEAN NOT NULL DEFAULT FALSE` 추가
- `export:curator-queue` 스크립트: 위 필터+정렬로 JSON 내보내기
- visitjeju 3,712건: `review_excluded=true` 일괄 업데이트
- naver 검토 큐: ~1,606건 (rejected 43건 제외)
- ADR-0027(HITL) 연계: Label Studio 큐레이션 UI에 정렬 순서 반영
