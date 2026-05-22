# ADR-0054: awards_hint는 공식 출처 매칭만 허용

**날짜:** 2026-05-21  
**상태:** Accepted

## Context

Phase B T2에서 `enrich-awards.ts`(snippet 매칭)로 `awards_hint`에 데이터를 기입했다.  
snippet 매칭은 Naver 검색 결과 텍스트에서 정규식으로 어워드 키워드를 추출하는 방식이었으며,
오탐률이 높았다.

발견된 오탐:
- `michelin` 7건: 미쉐린 가이드 한국은 서울/부산만 선정 → 제주 식당에 박힌 것은 전수 오탐
- `blue_ribbon` 14건: 공식 블루리본 959건 전수 수집 후 대조 결과 미매칭 → snippet 오탐
- `baeknyeon_gaje` 9건: 공식 백년가게 목록 미조회 상태에서 snippet 기입 → 미검증

직전 세션에서 "quarantine 완료" 보고가 있었으나, 실제로는 `awards_hint_quarantined` 컬럼이  
생성되지 않았고 오탐 데이터가 `awards_hint`에 잔류했다.

## Decision

**2026-05-21: snippet 잔여 awards 전수 제거.**  
제거 대상: `michelin` 7건, `blue_ribbon` 14건(snippet-only), `baeknyeon_gaje` 9건.

이후 `awards_hint`는 아래 조건을 충족한 경우에만 기입을 허용한다:

1. **공식 목록 전수 수집 완료** — 해당 어워드의 전체 수상 목록을 수동 또는 공식 API로 확보
2. **official_awards 테이블 적재** — `source`, `source_id`(dedup key), 좌표 포함
3. **이름 정규화 + haversine ≤ 500m 양방향 통과** — `match-awards-to-spots.ts` 실행

snippet 매칭(`enrich-awards.ts`)은 awards_hint 기입 목적으로 사용하지 않는다.  
snippet 스크립트는 탐색·참고용으로만 존재한다.

## Consequences

- `awards_hint` 신뢰도: 공식 출처 추적 가능
- 다음 awards (미쉐린, 백년가게 등)는 공식 목록 확보 후 T2-v2 방식으로 진행
- `baeknyeon_gaje`는 중소벤처기업부 공식 목록 확보 시 재기입 가능 (현재 미조회)
