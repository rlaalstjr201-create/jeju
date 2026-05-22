# Light Spec — 스키마 확장 (마이그 020)

**Feature:** 점수 기반 선별을 위한 buzz score·trend·보강 필드 추가  
**Persona:** 큐레이터(서비스 운영자 1인), 파이프라인 스크립트  
**Status:** Draft (2026-05-20)  
**Depends on:** ADR-0051 (점수 설계), ADR-0049 (trend_category)  
**Migration:** 020 (018·019 기적용 후)  
**Preceding migration:** 019 (`curation_decisions.tier_override`)

---

## 1. 범위

**In (마이그 020):**
- `spots.external_buzz_count` — 네이버 블로그+카페 totalCount 합산
- `spots.external_buzz_score` — percentile 정규화 점수 (0~10)
- `spots.final_score` — 종합 점수 (buzz + 보너스)
- `spots.trend_category` — rising/steady/declining/seasonal/new
- `spots.external_links` — 외부 URL JSONB (카카오 지도, 네이버 지도 등)
- `spots.augmented_intro` — 네이버 snippet 보강 소개글
- `spots.user_added_links` — 사용자 제안 링크 JSONB (v1.5+ 준비)
- `curation_candidates.*` — 동일 컬럼 추가 (파이프라인 중간 저장용)
- 인덱스 추가

**Out (020):**
- 기존 컬럼 변경·삭제 없음
- `curation_decisions` 테이블 변경 없음
- `spots.final_score`의 공개 API 노출 (앱 v1 이후)

---

## 2. DDL — `spots` 테이블 추가 컬럼

```sql
ALTER TABLE spots
  ADD COLUMN external_buzz_count  INTEGER,
  ADD COLUMN external_buzz_score  DECIMAL(4, 2),
  ADD COLUMN final_score          DECIMAL(4, 2),
  ADD COLUMN trend_category       TEXT
    CHECK (trend_category IN ('steady', 'rising', 'declining', 'seasonal', 'new')),
  ADD COLUMN external_links       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN augmented_intro      TEXT,
  ADD COLUMN user_added_links     JSONB NOT NULL DEFAULT '{}';
```

---

## 3. DDL — `curation_candidates` 테이블 추가 컬럼

```sql
ALTER TABLE curation_candidates
  ADD COLUMN external_buzz_count  INTEGER,
  ADD COLUMN external_buzz_score  DECIMAL(4, 2),
  ADD COLUMN final_score          DECIMAL(4, 2),
  ADD COLUMN trend_category       TEXT
    CHECK (trend_category IN ('steady', 'rising', 'declining', 'seasonal', 'new')),
  ADD COLUMN external_links       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN augmented_intro      TEXT,
  ADD COLUMN user_added_links     JSONB NOT NULL DEFAULT '{}';
```

---

## 4. 인덱스

```sql
-- 카테고리별 점수 내림차순 정렬 (Phase C 쿼터 선별 핵심)
CREATE INDEX idx_curation_candidates_category_score
  ON curation_candidates (category, final_score DESC);

-- 트렌드 필터링 (declining 패널티 조회 등)
CREATE INDEX idx_curation_candidates_trend
  ON curation_candidates (trend_category)
  WHERE trend_category IS NOT NULL;

-- spots도 동일
CREATE INDEX idx_spots_category_score
  ON spots (category, final_score DESC);

CREATE INDEX idx_spots_trend
  ON spots (trend_category)
  WHERE trend_category IS NOT NULL;
```

---

## 5. 컬럼 설명

| 컬럼 | 타입 | NULL | 설명 |
|---|---|---|---|
| `external_buzz_count` | INT | YES | 네이버 블로그+카페 totalCount 합산. Phase B 출력. |
| `external_buzz_score` | DECIMAL(4,2) | YES | 카테고리 내 percentile 정규화 (0~10). Phase B 출력. |
| `final_score` | DECIMAL(4,2) | YES | buzz + awards + whitelist + trend 종합. Phase C 출력. |
| `trend_category` | TEXT | YES | 네이버 데이터랩 12개월 트렌드 판정. Phase C 출력. |
| `external_links` | JSONB | NO | `{ kakao: "...", naver: "..." }`. 카카오 place_id 기반. |
| `augmented_intro` | TEXT | YES | 네이버 snippet 보강 소개. Phase D 출력 (v1.5). |
| `user_added_links` | JSONB | NO | v1.5+ 사용자 제안 링크 예약 컬럼. `{}` 기본값. |

---

## 6. 변경되지 않는 것

- `curation_candidates.tier`, `awards_hint`, `llm_summary`, `llm_tags` (018에서 추가됨) — 유지
- `curation_candidates.status` CHECK constraint 변경 없음
- `spots.tier`, `awards`, `curator_comment` (018에서 추가됨) — 유지

---

## 7. 코드 변경 포인트

- `PostgresCurationCandidateRepository`: `external_buzz_count`, `external_buzz_score`, `final_score`, `trend_category` SELECT/UPDATE 추가
- `PostgresSpotRepository`: 동일 컬럼 추가
- Phase B 스크립트 (`buzz-calculator.ts`): `external_buzz_count` → `external_buzz_score` 계산 후 UPDATE
- Phase C 스크립트 (`score-selector.ts`): `final_score` 계산 + 카테고리 쿼터 SELECT

---

## 8. 롤백 계획

```sql
ALTER TABLE spots
  DROP COLUMN IF EXISTS external_buzz_count,
  DROP COLUMN IF EXISTS external_buzz_score,
  DROP COLUMN IF EXISTS final_score,
  DROP COLUMN IF EXISTS trend_category,
  DROP COLUMN IF EXISTS external_links,
  DROP COLUMN IF EXISTS augmented_intro,
  DROP COLUMN IF EXISTS user_added_links;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS external_buzz_count,
  DROP COLUMN IF EXISTS external_buzz_score,
  DROP COLUMN IF EXISTS final_score,
  DROP COLUMN IF EXISTS trend_category,
  DROP COLUMN IF EXISTS external_links,
  DROP COLUMN IF EXISTS augmented_intro,
  DROP COLUMN IF EXISTS user_added_links;
```

---

## 9. 의존성 순서

```
마이그 018 (tier, awards, curator_comment)
  → 마이그 019 (curation_decisions.tier_override)
    → 마이그 020 (buzz score, trend) ← 이 Spec
      → Phase A 롤백 + 재적재
        → Phase B buzz 계산
          → Phase C 점수 선별
```
