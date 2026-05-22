# Light Spec — Phase 0 Seed: Hidden Gem 자동 발굴 → 큐레이터 검토 파이프라인

**Feature:** Phase 0 시드 수집 + LLM 점수화 + Kakao 검증 + CurationCandidate 적재 + Label Studio 검토 + 승인 Spot embedding 배치  
**Persona:** 큐레이터(서비스 운영자 1인)  
**Status:** Draft  
**Depends on:** ADR-0023, 0024, 0025, 0026, 0027, 0028, 0029, 0030  
**Migration:** 013 (this spec에서 SQL 확정)

---

## 1. 범위

**In (v1):**
- Stage 1: 비짓제주 API → base layer 후보 수집
- Stage 2: 네이버 블로그·카페 검색 API → long-tail hidden gem 후보 발굴
- Stage 3: Claude API structured output → authenticity/ordinariness 점수화
- Stage 4: 카카오 로컬 API → 좌표·실재 검증, 비짓제주 중복 제거
- Stage 5: 반경 100m dedup → CurationCandidate 적재 → Label Studio 검토 대기열
- Embedding 배치: 승인 Spot raw text + LLM 추론 concat → Voyage AI (수동 trigger)
- LabelStudioBridge: webhook → curation_decisions 영속화

**Out (v1.5+):**
BC카드/빅데이터\_GW, 자동 trend/popularity 산정, 거절 사유 DBSCAN 클러스터링, 인스타·유튜브, Argilla 전환, 다중 큐레이터

---

## 2. 파이프라인 5단계

### Stage 표

| Stage | 컴포넌트 | 입력 | 출력 | Rate Limit | 비고 |
|---|---|---|---|---|---|
| 1 | `VisitjejuAdapter` | `/vsjApi/contents/searchList` params | `VisitjejuRawSpot[]` | 확인 필요 (OQ-1) | base layer, 좌표·썸네일 내장. **Stage 3 우회 → Stage 4 직행** |
| 2 | `NaverSearchAdapter` | long-tail 쿼리 50개 (큐레이터 직접 설계) | `NaverSearchItem[]` | 25,000/일 (OQ-1) | 블로그·카페 각각 호출 |
| 3 | `LlmExtractor` | 네이버 snippet + query | `LlmExtraction` | Anthropic 표준 | **네이버 후보에만 적용**. authenticity·ordinariness 점수화. 비짓제주는 해당 없음 |
| 4 | `KakaoLocalVerifier` | spot_name + 추정 좌표 | `KakaoVerification` | 100,000/일 | 좌표·실재 검증. 미매칭 → OQ-5 |
| 5 | `CandidateDeduper` | lat/lng + sourceType | dedup 결과 | — | 반경 100m + 좌표 round. visitjeju 우선 (ADR-0029). 통과 시 DB 적재 |

### 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                     Phase 0 Discovery Pipeline                  │
│                    (수동 trigger, cron 없음)                     │
└─────────────────────────────────────────────────────────────────┘

 Stage 1                          Stage 2
 비짓제주 API                     네이버 블로그·카페 검색 API
 (관광지 시드)                    (long-tail 쿼리 50개)
       │                                 │
       ▼                                 ▼
 VisitjejuRawSpot                 NaverSearchItem
 좌표·썸네일 내장                        │
       │                                 ▼
       │                          Stage 3: LlmExtractor
       │                          (네이버 후보에만 적용)
       │                          authenticity_score
       │                          ordinariness_score
       │                          spot_name 추정, summary
       │          Stage 3 우회            │
       └──────────────────┬──────────────┘
                          │ (두 소스 합산)
                          ▼
                   Stage 4: KakaoLocalVerifier
                   spot_name → kakao_place_id, lat, lng
                   미매칭 → status='kakao_unverified' (OQ-5)
                          │
                          ▼
                   Stage 5: CandidateDeduper
                   반경 100m + 좌표 round 중복 제거
                   visitjeju 출처 우선:
                   naver 후보가 visitjeju와 중복이면 naver 제거
                          │
                     (중복 아닌 경우만)
                          ▼
                 curation_candidates (status='pending')
                          │
                          ▼
                   Label Studio (Docker)
                   큐레이터 검토: approve / reject / hold
                   rejection_reason_enum + text
                          │
               ┌──────────┴───────────┐
               │ approve              │ reject / hold
               ▼                     ▼
       LabelStudioBridge        curation_decisions
       webhook → curation_      (ADR-0022: rejected
       decisions persist        재발굴 X)
               │
               ▼
       ApproveCandidateUseCase
       → spots 테이블 저장
               │
               ▼
       SpotMetaInferer (EmbeddingBatcher 내부 호출)
       비짓제주 introduction + tag
       → LLM 추론: 분위기·혼잡도·시간대·고객층
               │
               ▼
       EmbeddingBatcher (수동 trigger)
       raw intro + SpotMetaInferer 추론 concat → Voyage AI
       → spots.embedding 업데이트
```

---

## 3. 컴포넌트 8개 — 입출력 타입

### 3.1 VisitjejuAdapter

위치: `src/infrastructure/visitjeju/VisitjejuAdapter.ts`

```typescript
// Port
export interface VisitjejuApiPort {
  fetchAll(params?: VisitjejuFetchParams): AsyncIterable<VisitjejuRawSpot>
}

export interface VisitjejuFetchParams {
  category?: string   // c1=관광지, c4=음식점 등
  region?: string     // region1cd
  pageSize?: number   // default 100
}

export interface VisitjejuRawSpot {
  contentsid: string
  contentscd: string
  title: string
  address: string
  roadaddress: string
  latitude: string
  longitude: string
  tag: string
  introduction: string
  repPhoto: { thumbnailpath: string; imgpath: string } | null
  region1cd: string
  region2cd: string
}
```

### 3.2 NaverSearchAdapter

위치: `src/infrastructure/naver/NaverSearchAdapter.ts`

```typescript
// Port
export interface NaverSearchApiPort {
  searchBlog(query: string, display?: number): Promise<NaverSearchResult>
  searchCafe(query: string, display?: number): Promise<NaverSearchResult>
}

export interface NaverSearchResult {
  query: string
  items: NaverSearchItem[]
}

export interface NaverSearchItem {
  title: string
  link: string
  description: string  // snippet (HTML 태그 포함 가능)
  postdate: string     // YYYYMMDD
}
```

### 3.3 LlmExtractor

위치: `src/infrastructure/llm/LlmExtractorAdapter.ts`

```typescript
// Port
export interface LlmExtractorPort {
  extract(input: LlmExtractionInput): Promise<LlmExtraction>
}

export interface LlmExtractionInput {
  snippet: string   // 네이버 description (HTML 태그 제거 후)
  query: string     // 원본 검색 쿼리 (컨텍스트용)
}

export interface LlmExtraction {
  spot_name: string | null             // 추정 장소명. 식별 불가면 null
  category: SpotCategory
  authenticity_score: number           // 0.0–1.0. 높을수록 광고 아님
  ordinariness_score: number           // 0.0–1.0. 높을수록 패키지 여행 뻔한 곳
  summary: string                      // 1줄 (50자 이내)
}

export type SpotCategory =
  | 'natural'
  | 'cafe'
  | 'experience'
  | 'restaurant'
  | 'souvenir'
  | 'other'
```

**LLM prompt 전략 (ADR-0029):**
- authenticity: Zarei et al. ASONAM 2020 광고 탐지 신호 차용 (과도한 긍정, 홍보성 문구, CTA 패턴)
- ordinariness: "성산일출봉", "흑돼지거리" 등 패키지 여행 핵심 키워드 목록 기반 유사도. prompt 내 negative example로 주입
- 모델: `claude-opus-4-7`, structured output (Pydantic 스키마 → `tool_use`)
- 비용: 블로그 snippet 1건 ≈ $0.001. 5,000건/일 ≈ $5/일 (한도 내 운영)

### 3.4 KakaoLocalVerifier

위치: `src/infrastructure/kakao/KakaoLocalVerifier.ts`  
(기존 `KakaoLocalPlaceAdapter`와 별개 — 검증 전용)

```typescript
// Port
export interface KakaoLocalVerifierPort {
  verify(spotName: string, hintLat?: number, hintLng?: number): Promise<KakaoVerification>
}

export interface KakaoVerification {
  matched: boolean
  kakaoPlaceId: string | null
  lat: number | null
  lng: number | null
  address: string | null
  categoryName: string | null
}
```

미매칭 처리는 OQ-5 해소 전까지 Plan에서 확정. 잠정: `status = 'kakao_unverified'`로 적재, 큐레이터 판단 위임.

### 3.5 CandidateDeduper

위치: `src/application/curation/CandidateDeduper.ts`

```typescript
export interface CandidateDeduperPort {
  isDuplicate(
    lat: number,
    lng: number,
    sourceType: 'visitjeju' | 'naver'
  ): Promise<DedupeResult>
}

export interface DedupeResult {
  isDuplicate: boolean
  duplicateOfId: string | null             // 중복이면 기존 candidate id
  duplicateSourceType: 'visitjeju' | 'naver' | null
  reason: 'radius_100m' | 'coord_round' | null
}
```

구현 전략:
- **visitjeju 우선 처리 순서**: Stage 1(visitjeju) 결과를 먼저 dedup·적재한 뒤 Stage 2(naver) 처리. naver 후보가 이미 적재된 visitjeju 후보와 중복이면 naver 제거 (ADR-0029 "비짓제주 좌표와 비교해 중복 제거" 준수).
- **반경 100m**: Haversine 거리 < 100m인 기존 candidate 존재 여부 체크 (PostGIS ST_DWithin 또는 인메모리)
- **좌표 round**: `(lat * 1000).round / 1000` 동일 여부 (소수점 3자리 = ~111m 정밀도)
- 배치 실행 중 신규 등록 좌표는 인메모리 Set으로 관리 → 배치 종료 후 DB 확인과 병합

### 3.6 EmbeddingBatcher

위치: `src/infrastructure/embedding/EmbeddingBatcher.ts`

```typescript
export interface EmbeddingBatcherPort {
  run(spotIds?: string[]): Promise<EmbeddingBatchResult>
  runSingle(spotId: string): Promise<void>
}

export interface EmbeddingBatchResult {
  processed: number
  failed: number
  failedIds: string[]
}
```

**흐름 (ADR-0028):**
1. `spots` WHERE `embedding IS NULL` (또는 spotIds 지정)
2. 각 Spot: `SpotMetaInferer.infer(introduction, tags, name)` 호출 → 분위기·혼잡도·시간대·고객층 추론 텍스트 생성
3. `introduction + tags` (raw) + 추론 텍스트 concat → 최종 임베딩 소스
4. Voyage AI embedding API (`voyage-3-large`, 1024dim)
5. `spots.embedding` 업데이트
6. 실행 방법: `npm run embed:batch [--spot-ids id1,id2,...]`

**비용**: 200개 × $0.01~0.02 ≈ $3 총액 (ADR-0028)

### 3.7 SpotMetaInferer

위치: `src/infrastructure/llm/SpotMetaInfererAdapter.ts`  
(Stage 3 `LlmExtractor`와 별개 — 입력·출력·목적이 다름)

```typescript
// Port
export interface SpotMetaInfererPort {
  infer(input: SpotMetaInferInput): Promise<SpotMetaInference>
}

export interface SpotMetaInferInput {
  name: string
  introduction: string   // 비짓제주 raw introduction
  tags: string           // 비짓제주 tag 필드 (comma-separated)
}

export interface SpotMetaInference {
  atmosphere: string      // 분위기 묘사 (예: "한적한 해안 절벽, 사진 명소")
  crowd_level: string     // 혼잡도 추정 (예: "평일 오전 한산, 주말 오후 혼잡")
  best_time: string       // 추천 시간대 (예: "일출 직후 또는 오후 3시 이전")
  target_visitor: string  // 고객층 묘사 (예: "자연 사진 애호가, 트레킹 커플")
}
```

**역할 (ADR-0028):** 비짓제주 `introduction`은 짧고 사실 위주("유네스코 세계자연유산, 천연기념물 제420호")라 semantic 검색에 부적합. Claude API가 4축(분위기·혼잡도·시간대·고객층)을 추론해 자연어 질의("한적한 오름")와의 정렬을 개선한다.

- **모델**: `claude-opus-4-7`, structured output
- **호출 시점**: EmbeddingBatcher 내부. 파이프라인 Stage 3와 무관 (비짓제주 후보 전용)
- **비용**: Spot 1개 ≈ $0.01~0.02. 배치 200개 ≈ $3 총액 (ADR-0028)

### 3.8 LabelStudioBridge

위치: `src/infrastructure/labeling/LabelStudioBridge.ts`

```typescript
export interface LabelStudioBridgePort {
  handleWebhook(payload: unknown): Promise<void>
}

// webhook payload → 내부 결정 구조
export interface CurationDecisionInput {
  candidateId: string
  decidedBy: string                          // 큐레이터 username
  decision: 'approve' | 'reject' | 'hold'
  curationScore: number | null               // approve 시 필수 (1–10)
  rejectionReasonEnum: RejectionReasonEnum | null
  rejectionReasonText: string | null         // 자유 텍스트 1줄
  freeMemo: string | null
}

export type RejectionReasonEnum =
  | 'ad'           // 광고성
  | 'ordinary'     // 뻔함 (패키지 여행지)
  | 'low_quality'  // 낮은 품질
  | 'duplicate'    // 중복
  | 'other'
```

webhook 수신 엔드포인트: `POST /api/v1/admin/labeling/webhook` (OQ-3 해소 필요)

---

## 4. 마이그레이션 013

### 013_up_phase0_pipeline.sql

```sql
-- ================================================================
-- Migration 013 UP: Phase 0 Pipeline
-- 1. curation_candidates 확장 (visitjeju-first, LLM 점수 필드 추가)
-- 2. curation_decisions 신규 생성
-- ================================================================

-- ── Part 1: curation_candidates 확장 ───────────────────────────

-- v1에서 visitjeju가 1차 소스 (ADR-0023). kakao_place_id → 검증 후 채움
ALTER TABLE curation_candidates
  ALTER COLUMN kakao_place_id DROP NOT NULL;

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_kakao_place_id_key;

-- visitjeju 콘텐츠 ID (visitjeju 소스 후보의 고유 식별자)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS visitjeju_content_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_visitjeju_content_id_idx
  ON curation_candidates(visitjeju_content_id)
  WHERE visitjeju_content_id IS NOT NULL;

-- 소스 구분 (Stage 1: visitjeju, Stage 2: naver)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'visitjeju'
    CHECK (source_type IN ('visitjeju', 'naver'));

-- 네이버 발굴 원본 정보
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS naver_source_url TEXT;

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS naver_snippet    TEXT;

-- Stage 3 LLM 추출 결과 (ADR-0029)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS authenticity_score FLOAT4
    CHECK (authenticity_score BETWEEN 0 AND 1);      -- 높을수록 광고 아님

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ordinariness_score FLOAT4
    CHECK (ordinariness_score BETWEEN 0 AND 1);      -- 높을수록 뻔함

-- Stage 4 Kakao 미매칭 상태 (OQ-5)
ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_status_check;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
    CHECK (status IN ('pending', 'kakao_unverified', 'approved', 'rejected'));

-- LLM 종합 사전 점수 — v1: null, v2+ 활성 (ADR-0027, 0028)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ai_estimated_score SMALLINT
    CHECK (ai_estimated_score BETWEEN 1 AND 10);

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ai_estimated_at TIMESTAMPTZ;

-- ── Part 2: curation_decisions 신규 생성 ───────────────────────
-- (ADR-0027 스키마, ADR-0030 거절 사유 컬럼 포함)

CREATE TABLE IF NOT EXISTS curation_decisions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID        NOT NULL REFERENCES curation_candidates(id),
  decided_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by            TEXT        NOT NULL,
  decision              TEXT        NOT NULL
                                    CHECK (decision IN ('approve', 'reject', 'hold')),
  curation_score        SMALLINT
                                    CHECK (curation_score BETWEEN 1 AND 10),
  -- ADR-0030: v1 수집만, v1.5에서 DBSCAN 클러스터링 활성
  rejection_reason_enum TEXT
                                    CHECK (rejection_reason_enum IN
                                      ('ad', 'ordinary', 'low_quality', 'duplicate', 'other')),
  rejection_reason_text TEXT,
  -- v2+ 활성, v1 null (ADR-0027)
  ai_estimated_score    SMALLINT,
  ai_estimated_at       TIMESTAMPTZ,
  curator_override      BOOLEAN,    -- v2+: AI 추정과 다를 때 true
  free_memo             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_candidate_idx
  ON curation_decisions(candidate_id);

CREATE INDEX IF NOT EXISTS decisions_decided_at_idx
  ON curation_decisions(decided_at DESC);

-- ── Dead columns 현황 메모 (ADR-0026, ADR-0027, ADR-0030) ──────
-- spots.trend_score      → v1 zero 유지, v2 사용자 이벤트 대체 예정
-- spots.popularity_score → v1 zero 유지, v2 암묵적 피드백 대체 예정
-- curation_decisions.ai_estimated_* → v1 null, v2 진입 시 채움
-- curation_candidates.ai_estimated_* → v1 null, v2 진입 시 채움
```

### 013_down_phase0_pipeline.sql

```sql
-- ================================================================
-- Migration 013 DOWN
-- ================================================================

DROP TABLE IF EXISTS curation_decisions;

DROP INDEX IF EXISTS candidates_visitjeju_content_id_idx;

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_status_check;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
    CHECK (status IN ('pending','approved','rejected'));

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS ai_estimated_at,
  DROP COLUMN IF EXISTS ai_estimated_score,
  DROP COLUMN IF EXISTS ordinariness_score,
  DROP COLUMN IF EXISTS authenticity_score,
  DROP COLUMN IF EXISTS naver_snippet,
  DROP COLUMN IF EXISTS naver_source_url,
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS visitjeju_content_id;

ALTER TABLE curation_candidates
  ALTER COLUMN kakao_place_id SET NOT NULL;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_kakao_place_id_key
    UNIQUE (kakao_place_id);
```

---

## 5. API 엔드포인트

| 엔드포인트 | 메서드 | 역할 | 인증 |
|---|---|---|---|
| `/api/v1/admin/curation/pipeline/run` | POST | Phase 0 파이프라인 수동 trigger | curator role |
| `/api/v1/admin/curation/candidates` | GET | 후보 목록 (`status`, `limit`, `offset`) | curator role |
| `/api/v1/admin/curation/candidates/:id` | GET | 후보 상세 (LLM 점수 포함) | curator role |
| `/api/v1/admin/labeling/webhook` | POST | Label Studio webhook 수신 | webhook secret |
| `/api/v1/admin/embedding/batch` | POST | Embedding 배치 수동 trigger | curator role |

> 파이프라인 실행 응답: `{ queued: number, skipped_dedup: number, skipped_kakao_unverified: number }`

---

## 6. 수락 기준 (Acceptance Criteria)

### AC-1: 파이프라인 실행
- `POST /api/v1/admin/curation/pipeline/run` 호출 시 Stage 1·2가 독립적으로 수집을 완료한 뒤, 합산 결과가 Stage 3→4→5 순으로 처리되어 `curation_candidates` 테이블에 `status='pending'` 행이 삽입된다.
- 반경 100m 이내 동일 후보는 중복 삽입되지 않는다.
- 수동 trigger 없이 자동 실행(cron)이 없다.

### AC-2: LLM 점수화
- `authenticity_score`, `ordinariness_score` 두 필드가 0–1 범위로 저장된다.
- `spot_name`이 null인 경우 (식별 불가) 해당 후보는 dedup 대상에서 제외하고 Stage 4로 넘기지 않는다.

### AC-3: Label Studio 연동
- `docker run heartexlabs/label-studio` 기동 후 webhook URL 설정으로 큐레이터 검토가 가능하다.
- Label Studio에서 승인/거절/보류 결정 시 `curation_decisions` 테이블에 1행이 삽입된다.
- 거절 시 `rejection_reason_enum` 선택이 Label Studio UI에 제공되고 DB에 저장된다.
- Label Studio 연동 실패 시 Streamlit 30~50줄로 대체 가능 (ADR-0027 fallback).

### AC-4: Embedding 배치
- `POST /api/v1/admin/embedding/batch` 실행 후 `spots.embedding`이 `IS NOT NULL`인 행이 늘어난다.
- 배치 결과로 `{ processed, failed, failedIds }` 가 반환된다.
- cron 없음. 수동 trigger 또는 `npm run embed:batch` 스크립트만.

### AC-5: 거절 사유 데이터 수집 (ADR-0030)
- `rejection_reason_enum`, `rejection_reason_text` 두 컬럼이 `curation_decisions`에 존재하고 저장된다.
- v1에서 클러스터링 로직 없음 — 데이터 수집만.

### AC-6: 수량 KPI 없음 (ADR-0025)
- 파이프라인이 "N개 이상 승인" 강제를 하지 않는다.
- 큐레이터 검토 페이스 (분당 처리 건수) 가 측정 가능하도록 `decided_at` 타임스탬프가 기록된다.
- 거절 사유 enum 분포가 `curation_decisions` 조회로 집계 가능하다.

---

## 7. Open Questions (Plan 진입 전 해소)

- **OQ-1**: 비짓제주 API rate limit 확인 + 네이버 블로그·카페 검색 25,000/일이 합산인지 각각인지 — Stage 1·2 구현 전 실측
- **OQ-2**: LLM authenticity·ordinariness prompt 검증 방법 — 큐레이터가 30건 샘플 검토 후 수동 calibration. 별도 ADR 불필요(프롬프트는 코드 레벨 결정)
- **OQ-3**: Label Studio webhook → curation_decisions 매핑 위치 — admin API 확장(`LabelStudioBridge`) vs 별도 경량 서비스. 잠정: admin API 확장
- **OQ-4**: long-tail 쿼리 50개 저장 위치 — config JSON (`src/config/naver-queries.json`) vs DB 테이블. 잠정: config JSON (v1, 큐레이터 직접 편집)
- **OQ-5**: Stage 4 카카오 미매칭 시 처리 — `drop` vs `status='kakao_unverified'` hold-for-curator. 잠정: hold-for-curator (큐레이터가 Label Studio에서 수동 판단)
- **OQ-6**: Migration 013 적용 시점 — Light Spec 승인 직후 vs Plan 단계. 잠정: Light Spec 승인 직후 적용 (Plan에서 스키마 참조 가능하도록)
