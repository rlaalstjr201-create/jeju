# ADR-0042: Two-Tier 큐레이션 모델 (v1 채택)

Status: Accepted (2026-05-19) — Amended (2026-05-20) — Amended 2 (2026-05-21)

## Amendment 2 (2026-05-21): Naver Hidden 121건 영구 폐기

### 결정

알파 단계 hidden tier에서 Naver 발굴 121건을 영구 제외한다.  
`curation_candidates` 에서 전체 삭제 (2026-05-21 TRUNCATE TABLE curation_candidates 시 포함).

### 근거

| 항목 | 내용 |
|---|---|
| 알파 기반 변경 | 알파 = 비짓제주 1,000건 기반으로 확정 (ADR-0051). Naver hidden 개별 큐레이터 검토 ROI 낮음. |
| dedup 오염 | dedup v1 실행 결과 9건이 Naver sourced_from 유지한 채 visitjeju_content_id 오염 — 데이터 정합성 훼손. |
| 운영 비용 | Naver 발굴 재실행 시 서로 다른 dedup·scoring 체계 동시 운영 복잡도 증가. |
| 코드 보존 | Naver 발굴 인프라 코드 (`seed-pipeline.ts`, LLM extractor) 는 보존. v2+ 재사용 가능성 열어둠. |

### 변경된 Tier 정의

| Tier | 알파 내용 | 발굴 경로 |
|---|---|---|
| **reference** | 비짓제주 external_buzz_score 상위 1,000건. 큐레이터 코멘트로 맥락 제공. | 비짓제주 c1+c4, 점수 선별 (ADR-0051) |
| **hidden** | ~~Naver 발굴 121건~~ → **알파 미포함. v2+ 재검토.** | — |

Reference 알파 목표: 1,000건 선별 → 큐레이터 검토 → 최종 30건 (ADR-0025 유지).  
Hidden 20건 목표 (ADR-0025) 알파에서 삭제. 비짓제주 선별 후 미선별 ~2,500건이 hidden으로 보존됨.

---

## Amendment (2026-05-20): Two-Tier 모델 단순화

### 배경

Naver hidden gem 발굴 파이프라인(ADR-0029) 폐기. 비짓제주 점수 기반 선별로 전환.

### 변경된 Tier 정의

| Tier | 정의 (개정) | 발굴 경로 |
|------|------------|----------|
| **reference** | 비짓제주 3,534건 중 external_buzz_score 상위 1,000건. 큐레이터 코멘트로 "언제·어떻게" 맥락 제공. | 비짓제주 c1+c4, 점수 기반 자동 선별 (ADR-0051) |
| **hidden** | 네이버 발굴 121건. v1.5 큐레이터 검토 보류. | Naver long-tail 발굴 (ADR-0029 Deprecated — v1.5 재검토) |

Reference tier 알파 목표: **1,000건 선별 → 큐레이터 검토 → 최종 30건** (ADR-0025 유지)

### 변경되지 않은 것

- Thesis 재정의 유지: "큐레이터 시점이 있는 곳을 추천"
- `spots.tier` 컬럼: `enum('reference', 'hidden')` 유지
- 큐레이터 `tier_override` 필드 유지
- Reference 30 + Hidden 20 = 50건 알파 목표 유지

---

## Context

ADR-0029는 hidden gem(광고 회피 발굴) 전용 파이프라인을 다뤘다. ADR-0025는 thesis 정렬 우선, 수량 KPI 없음을 확립했다. 그런데 운영하면서 문제 하나가 드러났다:

**"유명한 곳은 무조건 제외한다"는 규칙이 없다.** 큐레이터 시점이 있으면 성산일출봉도 추천에 포함될 수 있다 — "11월 평일 새벽 5시, 안개 걷히는 순간이 유일하게 좋다"는 맥락이 있다면.

동시에, Phase 0 파이프라인이 실제로 산출한 후보들은 두 종류가 섞여 있다:

1. **Reference 후보**: 네이버 검색에서 자주 언급되지만 큐레이터 코멘트로 차별화 가능한 곳 (에코랜드, 먼물깍 등)
2. **Hidden 후보**: 검색 노출 빈도 낮고 광고 신호 없는 신발굴 spot (불고롱동백, 료바 등)

둘을 같은 tier로 처리하면 추천 UI에서 혼재된다. 추천 알고리즘도 "이 spot이 잘 알려진 spot인가 아닌가"를 구분하지 못하면 다양성 보장이 어렵다.

## Decision

### Two-Tier 모델 도입

| Tier | 정의 | 예시 | 발굴 경로 |
|------|------|------|----------|
| **reference** | 제주 여행에서 보편적으로 알려진 장소. 큐레이터 코멘트가 "언제·어떻게"의 맥락을 제공. | 성산일출봉, 에코랜드, 먼물깍 | visitjeju 시드 + 네이버 고빈도 |
| **hidden** | 검색 상위 노출 없음, 광고 신호 없음. 큐레이터가 직접 발굴한 spot. | 불고롱동백, 료바, 선흌곶식당 | 네이버 long-tail + authenticity ≥ 0.7 |

**Thesis 재정의**: "hidden gem만 추천한다"가 아니라 **"큐레이터 시점이 있는 곳을 추천한다"**. tier는 큐레이터 시점의 종류를 구분할 뿐, 추천 포함 여부를 결정하지 않는다.

### 구현 계획

- `spots.tier` 컬럼 추가: `enum('reference', 'hidden')` — 마이그레이션 번호는 풀런 완료 후 확정
- 자동 판정 기준 (큐레이터가 수동 override 가능):
  - visitjeju 시드 + awards 보유 (ADR-0044) → `reference`
  - naver 발굴 + authenticity_score ≥ 0.7 + awards 없음 → `hidden`
  - 그 외 → 큐레이터 판단
- `curation_decisions.tier_override` 필드: 큐레이터가 자동 판정과 다르게 분류할 경우 기록

### 알파 목표

Reference 30 + Hidden 20 = **50건** (ADR-0025의 "thesis 정렬 50개 = 알파 출시 가능" 유지)

## Consequences

**Positive:**
- 추천 다양성 보장: 알고리즘이 reference/hidden 비율을 조절할 수 있다.
- Thesis 경직성 완화: "에코랜드처럼 알려진 곳도 큐레이터 시점 있으면 포함"이 명시적으로 허용된다.
- awards 자동 판정(ADR-0044)과 결합하면 reference tier 분류 자동화 기반 확보.

**Negative / Risk:**
- tier 자동 판정 오류: authenticity_score 임계값(0.7)이 경계 케이스를 틀릴 수 있다. 큐레이터 override 필수.
- reference tier가 "뻔한 추천"으로 느껴질 수 있다 → 큐레이터 코멘트 품질이 차별화 핵심.

## Alternatives Considered

**Hidden-only (원안 ADR-0029 유지):** 기각.
- "성산일출봉은 절대 포함 못 한다"는 경직성. 큐레이터가 의미 있는 맥락을 가진 경우도 배제해야 하는 문제.

**단일 tier (구분 없음):** 기각.
- 추천 알고리즘이 reference/hidden 혼재를 다양성 측면에서 처리 불가. cold-start에서 유명 spot만 표면화될 위험.

**score 기반 대체 (tier 없이):** 검토 후 기각.
- ordinariness_score가 이미 "뻔함 정도"를 포착하나, 추천 UI 배지 표시와 알고리즘 다양성 보장에는 명시적 tier 필드가 더 직관적.

## References

- ADR-0025: 큐레이션 시드 목표 — thesis 정렬 우선 (알파 50건 기준 유지)
- ADR-0029: Phase 0 hidden gem 발굴 (hidden tier의 출처 — 확장됨)
- ADR-0023: 비짓제주 API (reference tier 1차 시드)
- ADR-0044: awards 자동 추출 (reference tier 자동 판정 입력)
