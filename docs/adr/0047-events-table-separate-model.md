# ADR-0047: 축제·행사 별도 events 모델 — v1.5 활성, v1 사전 준비

**Status:** Accepted  
**Date:** 2026-05-20  
**Deciders:** rlaal  

---

## Context

비짓제주 API 라이브 테스트(2026-05-20)에서 c5 카테고리가 "문화공간"(Spec 초기 가정)이 아닌 "축제/행사"(Festival/Event)임을 확인했다.

- c5 아이템 수: 474건
- 본질: 기간 한정 이벤트 — "어디"가 아니라 "언제"
- 기존 5-카테고리 grid(관광지·카페·맛집·체험·문화공간)에 섞으면 사용자 검색 의도("제주 카페 추천")와 불일치
- 인수인계 메모 7번 "이벤트 시점 컬럼 v1.5+ 보류"의 구체화 필요
- v1 알파: 여행 날짜 입력 UI 미구현, 동선 알고리즘 날짜 매칭 로직 없음 → 수집해도 활용 불가

---

## Decision

**알파(v1):** c5 축제/행사 수집하지 않음. `events` 테이블만 빈 상태로 사전 준비 (Migration 019).

**v1.5 trigger 조건:** 아래 두 가지 모두 충족 시 활성:
1. 사용자 여행 날짜 입력 UI 구현 완료
2. 동선 알고리즘에 날짜 매칭 로직 진입

**v1.5 활성 시 구현:**
- 비짓제주 c5 → `events` 테이블 수집 (`seed:visitjeju-events` 스크립트)
- 동선 생성 시 `"여행 기간 ∩ 축제 기간"` 매칭 → Day plan 추천
- 카테고리 grid 노출 X (이벤트 섹션 별도 렌더링)

---

## Consequences

**Positive:**
- 장소(spots)와 이벤트(events) 데이터 모델 명확히 분리
- v1.5 진입 시 Migration 019만 적용하면 즉시 활성 가능
- spots 테이블 오염 없음 (기간 컬럼 없음)

**Negative:**
- `events` 테이블이 v1에서 dead weight (빈 테이블)
- Migration 비용: 컬럼 1개 추가보다 분리 테이블이 이점 크다고 판단

---

## Alternatives Considered

- **체험 카테고리로 흡수:** 기각. 활동성은 겹치지만 "기간 한정"은 본질적으로 다른 속성
- **spots.event_start / event_end 컬럼 추가:** 기각. spots는 영구 장소, events는 시간 한정 — 모델 혼재
- **알파에서 c5도 수집:** 기각. 날짜 입력 UI와 동선 날짜 매칭 없이 수집만 해두면 데이터만 있고 활용 불가

---

## References

- ADR-0024: 외부 데이터 소스 매트릭스
- ADR-0042: Two-Tier 큐레이션 모델
- `specs/visitjeju-reference-top1000.md`: c5 알파 제외 결정 (OQ-V6 RESOLVED)
- `specs/events-table-019.md`: Migration 019 상세 스펙
- 인수인계 메모 7번: "이벤트 시점 컬럼 v1.5+ 보류"
