# Light Spec — spots 스키마 확장 (마이그 018)

**Feature:** spots 테이블에 tier·awards·큐레이터 코멘트 메타 필드 추가 + 임베딩 입력 우선순위 변경  
**Persona:** 큐레이터(서비스 운영자 1인), 모바일 앱 (배지 표시)  
**Status:** Draft  
**Depends on:** ADR-0042, ADR-0043, ADR-0044  
**Migration:** 018 (016·017 기적용 후)  
**Preceding migration:** 017 (`verified_by` CHECK 확장)

---

## 1. 범위

**In (마이그 018 + v1 코드 변경):**
- `spots.tier` — reference/hidden 구분 (ADR-0042)
- `spots.awards` — 블루리본·미쉐린 등 JSONB (ADR-0044)
- `spots.curator_comment` — Gemma 생성 코멘트 (ADR-0043)
- `spots.curator_comment_source` — 코멘트 출처 추적
- `spots.curator_comment_retry_count` — 다시뽑기 횟수
- `curation_candidates.tier` — 파이프라인 자동 판정 임시 저장
- `curation_candidates.awards_hint` — LLM/패턴 추출 임시 저장
- 인덱스: tier 단독, (tier, curation_score DESC) 복합
- **임베딩 입력 우선순위 변경**: `COALESCE(curator_comment, curation_comment, introduction)` (코드 변경, 마이그 없음)
- **`PostgresSpotRepository` 코드 변경**: 신규 컬럼 SELECT/INSERT/UPSERT 추가
- **`PostgresRecommenderAdapter` 코드 변경**: 응답에 `tier`, `curatorComment` 추가

**Out (018):**
- `spots.curator_comment` → 공개 API 노출 (앱 v1 이후 별도 PR)
- 기존 `spots.curation_comment` 마이그레이션·백필 (OQ-S1 해소 후)
- curation_decisions.tier_override (ADR-0042 — 별도 마이그 019 예정)

---

## 2. 신규 컬럼 상세

### 2.1 spots 테이블

| 컬럼 | 타입 | 제약 | 기본값 | 비고 |
|---|---|---|---|---|
| `tier` | TEXT | CHECK IN ('reference','hidden') | `'hidden'` | ADR-0042. NOT NULL |
| `awards` | JSONB | — | `'[]'` | ADR-0044. 배열 형태 저장 |
| `curator_comment` | TEXT | — | NULL | ADR-0043. Gemma 생성 초안 또는 큐레이터 수정본 |
| `curator_comment_source` | TEXT | CHECK IN ('gemma','claude_fallback','curator_edit') | NULL | `curator_comment` 작성자 추적 |
| `curator_comment_retry_count` | SMALLINT | ≥ 0 | `0` | 다시뽑기 횟수. Label Studio 재생성 이력 |

**awards JSONB 구조 예시 (ADR-0044):**
```json
["blue_ribbon", "michelin_star"]
```

배열 내 허용값: `"blue_ribbon"`, `"blue_ribbon_star"`, `"michelin"`, `"michelin_star"`, `"bib_gourmand"`

> **OQ-S1: `curation_comment` vs `curator_comment`**  
> `spots` 테이블에는 이미 `curation_comment TEXT` 컬럼이 존재한다 (마이그 003). 이 컬럼은 현재 사용되고 있는가?  
> - 사용 중 → `curation_comment` 유지 + `curator_comment` 신규 추가 (이중 관리)  
> - 미사용 → `curation_comment` → `curator_comment` 이름 변경 (PostgreSQL `ALTER TABLE ... RENAME COLUMN`)  
> Plan 진입 전 큐레이터 확인 필요.

### 2.2 curation_candidates 테이블

파이프라인 Stage 3에서 임시 저장. 큐레이터 검토 화면에서 참고용. `spots`로 승인 시 복사.

| 컬럼 | 타입 | 제약 | 기본값 | 비고 |
|---|---|---|---|---|
| `tier` | TEXT | CHECK IN ('reference','hidden') | `'hidden'` | 자동 판정 (ADR-0042). 큐레이터 override 가능 |
| `awards_hint` | TEXT[] | — | `'{}'` | ADR-0044 패턴 매칭 결과. 큐레이터 참고용 |

---

## 3. 마이그레이션 SQL 초안

### 018_up_spots_schema_extension.sql

```sql
-- ================================================================
-- Migration 018 UP: spots 스키마 확장
-- tier, awards, curator_comment 메타 필드 추가 (ADR-0042·0043·0044)
-- ================================================================

-- ── Part 1: spots 테이블 확장 ─────────────────────────────────────

-- tier: Two-Tier 큐레이션 모델 (ADR-0042)
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS tier TEXT
    NOT NULL DEFAULT 'hidden'
    CHECK (tier IN ('reference', 'hidden'));

-- awards: 외부 수상 이력 JSONB 배열 (ADR-0044)
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS awards JSONB
    NOT NULL DEFAULT '[]';

-- curator_comment: Gemma 생성 코멘트 + 큐레이터 수정본 (ADR-0043)
-- OQ-S1 해소 전까지 curation_comment와 병존.
-- OQ-S1 해소 후 018 적용 시 RENAME 또는 이중 유지 결정.
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment TEXT;

-- curator_comment_source: 코멘트 출처 추적
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment_source TEXT
    CHECK (curator_comment_source IN ('gemma', 'claude_fallback', 'curator_edit'));

-- curator_comment_retry_count: 다시뽑기 이력
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment_retry_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (curator_comment_retry_count >= 0);

-- ── Part 2: 인덱스 ───────────────────────────────────────────────

-- tier 단독 (큐레이션 다양성 보장 집계용)
CREATE INDEX IF NOT EXISTS spots_tier_idx
  ON spots(tier);

-- (tier, curation_score DESC) 복합 (추천 알고리즘 tier별 정렬용)
CREATE INDEX IF NOT EXISTS spots_tier_score_idx
  ON spots(tier, curation_score DESC);

-- awards 검색 (GIN — 배열 내 특정 award 존재 여부 조회)
CREATE INDEX IF NOT EXISTS spots_awards_gin_idx
  ON spots USING gin(awards);

-- ── Part 3: curation_candidates 확장 ─────────────────────────────

-- tier: 자동 판정 결과 임시 저장 (ADR-0042)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS tier TEXT
    DEFAULT 'hidden'
    CHECK (tier IN ('reference', 'hidden'));

-- awards_hint: 패턴 매칭 결과 임시 저장 (ADR-0044)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS awards_hint TEXT[]
    DEFAULT '{}';
```

### 018_down_spots_schema_extension.sql

```sql
-- ================================================================
-- Migration 018 DOWN
-- ================================================================

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS awards_hint,
  DROP COLUMN IF EXISTS tier;

DROP INDEX IF EXISTS spots_awards_gin_idx;
DROP INDEX IF EXISTS spots_tier_score_idx;
DROP INDEX IF EXISTS spots_tier_idx;

ALTER TABLE spots
  DROP COLUMN IF EXISTS curator_comment_retry_count,
  DROP COLUMN IF EXISTS curator_comment_source,
  DROP COLUMN IF EXISTS curator_comment,
  DROP COLUMN IF EXISTS awards,
  DROP COLUMN IF EXISTS tier;
```

---

## 4. ApproveCandidateUseCase 변경 사항

`curation_candidates` → `spots` 승인 시 신규 필드 복사:

```typescript
// ApproveCandidateUseCase 내부 (코드 변경은 Plan 단계에서 확정)
const spot: Spot = {
  // 기존 필드...
  tier: candidate.tier ?? 'hidden',
  awards: awardsHintToJsonb(candidate.awards_hint ?? []),
  curator_comment: null,          // Label Studio에서 코멘트 생성 후 채움
  curator_comment_source: null,
  curator_comment_retry_count: 0,
};

// awards_hint TEXT[] → awards JSONB 변환
function awardsHintToJsonb(hints: string[]): object {
  return hints; // v1: 배열 그대로 저장
}
```

---

## 5. v1 코드 변경 사항 (마이그 없음)

### 5.1 임베딩 입력 우선순위

`PostgresSpotRepository.ts` — `EmbedRow` 조회 및 임베딩 소스 구성 변경:

```typescript
// 현재 (변경 전)
type EmbedRow = { id: string; name: string; curation_comment: string | null; category: string };
// SELECT id, name, curation_comment, category FROM spots ...
// introduction: r.curation_comment ?? ''

// 변경 후
type EmbedRow = {
  id: string;
  name: string;
  curator_comment: string | null;   // 신규
  curation_comment: string | null;  // 기존 유지
  category: string;
};
// SELECT id, name, curator_comment, curation_comment, category FROM spots ...
// introduction: r.curator_comment ?? r.curation_comment ?? ''
```

우선순위: `COALESCE(curator_comment, curation_comment, introduction)`
- `curator_comment` (Gemma 생성 + 큐레이터 수정본) — 가장 풍부한 semantic 정보
- `curation_comment` (기존 수동 입력) — fallback
- `''` (빈 문자열) — 마지막 fallback (embedding 배치 에러 방지)

임베딩 배치(`EmbeddingBatcher`)는 이 변경으로 자동 혜택. `EmbeddingBatcher` 코드 변경 없음.

### 5.2 PostgresSpotRepository 변경

위치: `src/infrastructure/persistence/PostgresSpotRepository.ts`

**SELECT 쿼리 확장** (단건·다건 조회 모두):
```sql
-- 추가 컬럼
SELECT ..., tier, awards, curator_comment, curator_comment_source, curator_comment_retry_count
FROM spots
```

**INSERT / UPSERT ON CONFLICT 확장**:
```sql
INSERT INTO spots (
  ...,
  tier, awards, curator_comment, curator_comment_source, curator_comment_retry_count
) VALUES (
  ...,
  $tier, $awards::jsonb, $curator_comment, $curator_comment_source, $curator_comment_retry_count
)
ON CONFLICT (kakao_place_id) DO UPDATE SET
  ...,
  tier                          = EXCLUDED.tier,
  awards                        = EXCLUDED.awards,
  curator_comment               = EXCLUDED.curator_comment,
  curator_comment_source        = EXCLUDED.curator_comment_source,
  curator_comment_retry_count   = EXCLUDED.curator_comment_retry_count;
```

**Row → Domain 매핑 추가**:
```typescript
// SpotRow 타입 확장
tier: string;
awards: unknown;  // JSONB → string[]로 캐스팅
curator_comment: string | null;
curator_comment_source: string | null;
curator_comment_retry_count: number;

// 매핑
tier: row.tier as 'reference' | 'hidden',
awards: (row.awards as string[]) ?? [],
curatorComment: row.curator_comment,
curatorCommentSource: row.curator_comment_source as 'gemma' | 'claude_fallback' | 'curator_edit' | null,
curatorCommentRetryCount: row.curator_comment_retry_count,
```

### 5.3 PostgresRecommenderAdapter 변경

위치: `src/infrastructure/recommender/PostgresRecommenderAdapter.ts`

**SELECT 확장**:
```sql
SELECT ..., tier, awards, curator_comment
FROM spots
```

**Row → Domain 매핑 추가**:
```typescript
tier: row.tier as 'reference' | 'hidden',
awards: (row.awards as string[]) ?? [],
curatorComment: row.curator_comment,
```

추천 응답 DTO에 `tier`·`awards`·`curatorComment` 노출 여부는 앱 v1 API PR에서 결정 (현재 Out 범위).

### 5.4 영향 범위 요약

| 파일 | 변경 유형 |
|---|---|
| `PostgresSpotRepository.ts` | SELECT·INSERT·UPSERT 쿼리 확장, Row 타입 확장, 임베딩 소스 COALESCE |
| `PostgresRecommenderAdapter.ts` | SELECT 쿼리 확장, Row 타입 확장 |
| `PostgresDayPlanRepository.ts` | `curation_comment` 계속 사용, 변경 없음 |
| `PostgresShortlistRepository.ts` | `curation_comment` 계속 사용, 변경 없음 |
| `EmbeddingBatcher.ts` | 변경 없음 (Repository가 COALESCE 처리) |

---

## 7. 자동 판정 로직 (파이프라인 Stage 3 이후)

ADR-0042 기준을 코드로 표현:

```typescript
function determineTier(
  sourceType: 'visitjeju' | 'naver',
  awardsHint: string[],
  authenticityScore: number,
): 'reference' | 'hidden' {
  if (sourceType === 'visitjeju') return 'reference';
  if (awardsHint.length > 0) return 'reference';
  if (authenticityScore >= 0.7) return 'hidden';
  return 'hidden'; // 기본값
}
```

파이프라인 내 적용 시점: Stage 3 LLM 추출 → awards 패턴 매칭 → tier 판정 → Stage 4 Kakao 검증 → DB 적재.

---

## 8. 수락 기준

### AC-S1: 마이그레이션 적용
- `018_up` 실행 후 `spots` 테이블에 `tier`, `awards`, `curator_comment`, `curator_comment_source`, `curator_comment_retry_count` 컬럼이 존재한다.
- `curation_candidates`에 `tier`, `awards_hint` 컬럼이 존재한다.
- `018_down` 실행 후 모든 추가 컬럼과 인덱스가 제거된다.

### AC-S2: 제약 검증
- `spots.tier`에 `'reference'`·`'hidden'` 이외 값 삽입 시 PostgreSQL CHECK 위반.
- `spots.curator_comment_retry_count`에 음수 삽입 시 CHECK 위반.
- `spots.awards`에 임의 JSON 배열 삽입 가능 (값 검증은 앱 레이어).

### AC-S3: 인덱스 활용
- `SELECT * FROM spots WHERE tier = 'reference' ORDER BY curation_score DESC` 실행 시 `spots_tier_score_idx` 사용 (EXPLAIN ANALYZE 확인).

### AC-S4: 기존 데이터 호환
- 마이그 018 적용 후 기존 `spots` 행의 `tier = 'hidden'` (DEFAULT 적용), `awards = '[]'`, `curator_comment_retry_count = 0` 으로 자동 설정된다.
- 기존 API 엔드포인트(`GET /api/v1/spots`)는 응답 스키마 변경 없이 동작한다 (신규 필드는 응답에 추가되거나 미포함, 클라이언트 하위 호환).

---

## 9. Open Questions (Plan 진입 전 해소)

- **OQ-S1 (해소됨):** `spots.curation_comment`은 `PostgresSpotRepository`, `PostgresRecommenderAdapter`, `PostgresDayPlanRepository`, `PostgresShortlistRepository`에서 활발히 사용 중 (임베딩 소스 포함). 리네임·드롭 불가. **결정: 두 컬럼 병존.** `curation_comment` 그대로 유지, `curator_comment` 신규 추가. 임베딩은 `COALESCE(curator_comment, curation_comment, '')`. v1.5에서 통합 (Section 5.1 참조).
- **OQ-S2:** `awards` JSONB에 배열 외 구조 (`{"blue_ribbon": true, "michelin_star": true}` 맵 형태) 사용 여부. ADR-0044는 맵 형태 예시를 제시했으나, 배열이 GIN 인덱스 활용과 집계에 더 적합. Plan 단계에서 확정.
- **OQ-S3:** `curation_decisions.tier_override` 추가 시점 — 018에 포함할지 019로 분리할지. 큐레이터 Label Studio 워크플로우 구현 전이면 분리 권장.

---

## References

- ADR-0042: Two-Tier 큐레이션 모델 (`tier` 컬럼 도입 배경)
- ADR-0043: Gemma 큐레이터 코멘트 생성 (`curator_comment*` 컬럼 도입 배경)
- ADR-0044: awards 자동 추출 (`awards` JSONB 도입 배경)
- `migrations/003_up_spots.sql` — 기존 `curation_comment` 컬럼 정의
- `migrations/017_up_naver_kakao_cross.sql` — 직전 마이그레이션 (패턴 참조)
