# Plan — Phase 0 Seed: Hidden Gem 자동 발굴 파이프라인

**Feature:** Phase 0 시드 수집 + LLM 점수화 + Kakao 검증 + 큐레이터 검토 + Embedding 배치  
**Stage:** 4 — Plan  
**Spec:** `specs/phase-0-seed.md`  
**ADRs:** ADR-0023, 0024, 0025, 0026, 0027, 0028, 0029, 0030  
**Date:** 2026-05-18

---

## 0. OQ 6개 확정

| OQ | 잠정 | Plan 확정 | 근거 |
|---|---|---|---|
| OQ-1: 비짓제주 rate limit / 네이버 25,000 합산 여부 | 구현 전 실측 | **보수적 분할**: 네이버 블로그 12,500/일 + 카페 12,500/일 합산 25,000 가정. 초과 시 즉시 stop + 로그. 비짓제주는 pageSize=100 + 429 시 backoff retry(2회). 실측은 Task A1 직후 첫 실행에서 기록. | ADR-0029 rate limit 정책 준수 |
| OQ-2: LLM prompt 검증 방법 | 30건 샘플 수동 calibration | **prompt 파일 분리** (`src/infrastructure/llm/prompts/llm-extractor.prompt.ts`, `spot-meta-inferer.prompt.ts`). 30건 샘플 검토는 Task G1 직후 별도 수동 작업 (Plan 외). | 코드 레벨 결정, ADR 불필요 |
| OQ-3: webhook 위치 | admin API 확장 | **확정: admin API 확장** (`LabelStudioBridge` → `POST /api/v1/admin/labeling/webhook`). webhook secret은 `LABEL_STUDIO_WEBHOOK_SECRET` 환경변수. | 별도 서비스 오버스펙 |
| OQ-4: long-tail 쿼리 50개 위치 | config JSON | **확정: `src/config/naver-queries.json`**. 초기 파일은 큐레이터가 Plan 완료 후 직접 편집. Task F1에서 스키마 + 예시 10개 포함 placeholder 생성. | DB 테이블은 v1.5 쿼리 관리 기능 필요 시 |
| OQ-5: kakao 미매칭 처리 | hold-for-curator | **확정: `status='kakao_unverified'` 적재**. 별도 `synthetic_id` 컬럼 사용 (형식: `synth_<sha1(name+lat+lng)[:12]>`). `kakao_place_id`는 null 유지. 큐레이터 승인 시 `ApproveCandidateUseCase`가 `synthetic_id` 생성 후 `spots.synthetic_id`에 저장. 상세 결정 → §0-A 참조. | `kakao_place_id` 재사용은 v2 deep link 의미 오염; deterministic hash는 v1.5 dedup 추적 가능 |
| OQ-6: migration 013 시점 | Plan 시작 시 | **확정: Task A1 (Plan 첫 번째 작업)**. Plan 나머지 태스크가 새 스키마를 참조. | 스키마 파악 전 타입 정의 불가 |

---

## §0-A. OQ-5 합성 ID 상세 결정

### 형식

```typescript
import { createHash } from 'crypto'

function buildSyntheticId(name: string, lat: number, lng: number): string {
  const payload = `${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`
  const hash = createHash('sha1').update(payload).digest('hex').slice(0, 12)
  return `synth_${hash}`
}
// 예: "synth_a3f9c12d4e8b"
```

**Deterministic 이유:** 동일한 물리 장소가 다른 쿼리에서 재발굴돼도 같은 `synthetic_id` 생성 → v1.5 클러스터링·dedup 추적 가능. UUID v4(random)은 재발굴 시 동일성 판단 불가.

### 생성 시점

`ApproveCandidateUseCase.execute()` 내부 — 큐레이터가 승인을 결정한 시점. 파이프라인(Stage 1~5)에서는 생성하지 않음.

조건:
```typescript
if (candidate.kakaoPlaceId !== null) {
  // kakao 검증 완료 후보 → kakao_place_id 사용, synthetic_id 없음
} else {
  // kakao_unverified 후보 → synthetic_id 생성, kakao_place_id null 유지
  const syntheticId = buildSyntheticId(candidate.name, lat, lng)
}
```

### 컬럼 배치

`kakao_place_id`는 실제 카카오 장소 ID 전용. 합성 ID는 **별도 컬럼**:

| 테이블 | 컬럼 | 의미 |
|---|---|---|
| `curation_candidates` | `synthetic_id TEXT` | 이력 추적용. `ApproveCandidateUseCase` 실행 시 채움 |
| `spots` | `synthetic_id TEXT UNIQUE` | 미검증 Spot의 primary identifier |
| `spots` | `kakao_place_id TEXT` | **nullable로 변경** (migration 013 addendum). 실매칭 시점에만 채움 |

Migration 013 SQL 추가 (spec §4 이후):
```sql
-- curation_candidates: 합성 ID 이력 컬럼
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS synthetic_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_synthetic_id_idx
  ON curation_candidates(synthetic_id)
  WHERE synthetic_id IS NOT NULL;

-- spots: kakao_place_id nullable로, synthetic_id 추가
ALTER TABLE spots
  ALTER COLUMN kakao_place_id DROP NOT NULL;

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS synthetic_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS spots_synthetic_id_idx
  ON spots(synthetic_id)
  WHERE synthetic_id IS NOT NULL;
```

Down 스크립트 추가:
```sql
DROP INDEX IF EXISTS spots_synthetic_id_idx;
ALTER TABLE spots DROP COLUMN IF EXISTS synthetic_id;
ALTER TABLE spots ALTER COLUMN kakao_place_id SET NOT NULL;
DROP INDEX IF EXISTS candidates_synthetic_id_idx;
ALTER TABLE curation_candidates DROP COLUMN IF EXISTS synthetic_id;
```

### 큐레이터 kakao_place_id 보강

큐레이터가 나중에 실제 kakao ID를 찾아 보강하는 경우 (v1.5 scope):

```
PATCH /api/v1/admin/spots/:id/kakao-place-id
{ kakaoPlaceId: "1234567890" }
```

`spots.kakao_place_id` 채움, `spots.synthetic_id` 유지 (이력). `kakao_place_id`가 채워지면 v2 deep link가 자동 활성화됨. 이 엔드포인트는 v1.5 작업 — **Plan에서 구현 안 함**, 설계만 기록.

### v1.5 dedup 정책 및 ADR-0022 정합

ADR-0022 "rejected 재발굴 X" 준수 방식:

1. **파이프라인 dedup (현재)**: `CandidateDeduper`가 모든 기존 candidates(rejected 포함) 좌표를 로드해 반경 100m 체크. rejected 후보의 좌표가 인메모리에 있으므로 동일 장소 재발굴 시 차단.

2. **`synthetic_id` 기반 체크 (v1.5 추가)**: `RunDiscoveryPipelineUseCase`가 visitjeju candidates 저장 전 `findExistingVisitjejuContentIds()`, naver 검증된 candidates 저장 전 `findExistingKakaoPlaceIds()`를 호출. 현재 이 메서드들은 status 무관 전체 조회 → rejected 포함.

`synthetic_id`를 추가로 체크하는 `findExistingKakaoAndSyntheticIds()` 메서드는 **v1.5 진입 시 추가**. v1에서는 좌표 dedup으로 충분.

---

## 1. 핵심 제약

- **기존 테스트 회귀 없음**: 현재 245건(unit + integration + e2e) 모두 통과 상태 유지.
- **비활성 어댑터 7종 미접촉**: DatalabVisitkoreaAdapter, JejuTourismBigdataAdapter, KakaoMapRatingAdapter, KakaoLocalPlaceAdapter, BC카드/두루누비/관광사진\_GW 관련 코드 변경 없음 (ADR-0024).
- **수동 trigger 전용**: cron 코드 없음. 자동 실행 경로 없음 (ADR-0017).
- **LLM 사전 점수 = 참고용**: authenticity·ordinariness 점수는 큐레이터 UI 표시용. ranking 결정 로직 없음 (ADR-0026, 0029).
- **4슬롯 데이터 모델 정합**: 신규 코드가 WHAT/WHERE/DISCOVERY/WHY 슬롯 모델을 위반하지 않음 (ADR-0024).
- **TDD 필수**: 모든 컴포넌트 Port → Red → Green 사이클. 외부 API 의존은 Port 뒤로 격리 (MSW 또는 vi.fn()).

---

## 2. 현재 상태 (as-is)

### 2.1 curation_candidates 스키마 (migration 010)

```
curation_candidates(
  id UUID, kakao_place_id TEXT UNIQUE NOT NULL,  ← migration 013에서 nullable로
  name TEXT, region TEXT, category TEXT,
  llm_summary TEXT, llm_tags TEXT[], status TEXT ('pending'|'approved'|'rejected'),
  discovered_at DATE, sourced_from TEXT,
  lat FLOAT8, lng FLOAT8, thumbnail_url TEXT, price_range TEXT, enriched_at DATE,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
```

**누락 필드 (migration 013에서 추가):** `visitjeju_content_id`, `source_type`, `naver_source_url`, `naver_snippet`, `authenticity_score`, `ordinariness_score`, `ai_estimated_score`, `ai_estimated_at`, `synthetic_id`, status 확장(`kakao_unverified`).

**spots 테이블 변경 (migration 013 addendum, §0-A):** `kakao_place_id` nullable로, `synthetic_id TEXT UNIQUE` 추가.

### 2.2 curation_decisions 없음

현재 `curation_decisions` 테이블 없음. migration 013에서 신규 생성.

### 2.3 기존 ApproveCandidateUseCase

현재 시그니처: `execute({ candidateId, curationScore, curationComment? })` → `Spot` 생성. 내부에서 `candidate.kakaoPlaceId`를 `spot.kakaoPlaceId`로 사용.

**변경 필요 (Task C4, §0-A 확정 사항):**
- `kakaoPlaceId`가 null인 `kakao_unverified` 후보 승인 시 `buildSyntheticId(name, lat, lng)` 생성.
- `candidate.synthetic_id` + `spot.synthetic_id` 동시 저장. `spot.kakao_place_id = null`.
- 기존 동작(kakao 검증 완료 후보, `kakaoPlaceId` non-null) 회귀 없도록 분기.

### 2.4 기존 CurationCandidateRepository 포트

현재 메서드: `findById`, `findByStatus`, `findExistingKakaoPlaceIds`, `save`, `updateStatusConditional`.

**추가 필요 (Task C1):** `findAllWithCoordinates(): Promise<Array<{ id: string; lat: number; lng: number; sourceType: string }>>` — CandidateDeduper 초기화용.

---

## 3. 아키텍처 — DDD 레이어 매핑

```
domain/
  ports/
    + CurationDecisionRepository.ts   (Task C3)
  curation/
    (기존 CurationCandidate.ts 타입 확장)  (Task A2)

application/
  ports/
    + VisitjejuApiPort.ts             (Task A2)
    + NaverSearchApiPort.ts           (Task A2)
    + LlmExtractorPort.ts             (Task A2)
    + KakaoLocalVerifierPort.ts       (Task A2)
    + SpotMetaInfererPort.ts          (Task A2)
    + EmbeddingBatcherPort.ts         (Task A2)
    + LabelStudioBridgePort.ts        (Task A2)
  curation/
    + RunDiscoveryPipelineUseCase.ts  (Task C6)
    + RunDiscoveryPipelineUseCase.test.ts
    + PersistCurationDecisionUseCase.ts  (Task C4)
    + PersistCurationDecisionUseCase.test.ts
    + CandidateDeduper.ts             (Task C1)
    + CandidateDeduper.test.ts
    ~ ApproveCandidateUseCase.ts      (Task C5, 기존 수정)
    ~ ApproveCandidateUseCase.test.ts (기존 테스트 + 신규 케이스)

infrastructure/
  visitjeju/
    + VisitjejuAdapter.ts             (Task B1)
    + VisitjejuAdapter.test.ts
  naver/
    + NaverSearchAdapter.ts           (Task B2)
    + NaverSearchAdapter.test.ts
  llm/
    + LlmExtractorAdapter.ts          (Task B3)
    + LlmExtractorAdapter.test.ts
    + SpotMetaInfererAdapter.ts       (Task B5)
    + SpotMetaInfererAdapter.test.ts
    + prompts/
      + llm-extractor.prompt.ts
      + spot-meta-inferer.prompt.ts
  kakao/
    + KakaoLocalVerifier.ts           (Task B4)
    + KakaoLocalVerifier.test.ts
    (기존 KakaoLocalPlaceAdapter 미접촉)
  embedding/
    + EmbeddingBatcher.ts             (Task D1)
    + EmbeddingBatcher.test.ts
  labeling/
    + LabelStudioBridge.ts            (Task D2)
    + LabelStudioBridge.test.ts
  persistence/
    + PostgresCurationDecisionRepository.ts  (Task C3)
    + PostgresCurationDecisionRepository.test.ts
    ~ PostgresCurationCandidateRepository.ts (Task C1, findAllWithCoordinates 추가)

interface/
  api/
    routes/
      + phase0-pipeline.ts            (Task E1)
      + labeling-webhook.ts           (Task E2)
      + embedding-batch.ts            (Task E3)
    ~ AppDependencies.ts              (Task E1~E3에서 DI 연결)

config/
  + naver-queries.json                (Task F1)

migrations/
  + 013_up_phase0_pipeline.sql        (Task A1)
  + 013_down_phase0_pipeline.sql      (Task A1)

scripts/
  + embed-batch.ts                    (Task F2)

tests/e2e/
  + phase0-pipeline.test.ts           (Task G1)
```

> `+` = 신규, `~` = 기존 파일 수정

---

## 4. 의존 관계 그래프

```
A1 (migration)
  └─ A2 (port types + CurationCandidate 타입 확장)
       ├─ B1 (VisitjejuAdapter)    ──┐
       ├─ B2 (NaverSearchAdapter)  ──┤
       ├─ B3 (LlmExtractorAdapter) ──┤─ C6 (RunDiscoveryPipelineUseCase)
       ├─ B4 (KakaoLocalVerifier)  ──┤       └─ E1 (pipeline route + DI)
       ├─ C1 (CandidateDeduper)    ──┘              └─ G1 (e2e)
       ├─ C3 (CurationDecisionRepository)
       │    └─ C4 (PersistCurationDecisionUseCase)
       │         └─ D2 (LabelStudioBridge)
       │              └─ E2 (webhook route + DI)
       ├─ C5 (ApproveCandidateUseCase 수정)
       │    └─ E1 (pipeline route에서 approve 흐름 검증)
       └─ B5 (SpotMetaInfererAdapter)
            └─ D1 (EmbeddingBatcher)
                 └─ E3 (embedding batch route + DI)
                      └─ G1 (e2e)

F1 (naver-queries.json) → B2 구현에서 참조
F2 (embed:batch script) → D1 구현 완료 후
```

---

## 5. 구현 작업 (TDD 사이클)

### Phase A: Foundation

#### A1 — Migration 013 파일 작성 + 적용
**커밋:** `feat(migrations): 013 phase0 pipeline schema`  
**작업:**
1. `migrations/013_up_phase0_pipeline.sql` 작성 (spec §4 SQL 그대로)
2. `migrations/013_down_phase0_pipeline.sql` 작성
3. `npm run migrate` (또는 `migrationRunner` 수동 실행)으로 적용 확인
4. `psql`로 `\d curation_candidates`, `\d curation_decisions` 컬럼 검증

**예상:** 1h

---

#### A2 — Port 인터페이스 + 공유 타입 정의 (Port 단계)
**커밋:** `feat(ports): phase0 pipeline port interfaces + shared types`  
**작업:**
1. `src/application/ports/` 에 신규 Port 파일 7개 작성 (spec §3 타입 그대로)
2. `src/domain/curation/CurationCandidate.ts` 타입 확장:
   ```typescript
   // 기존 필드 유지, 추가:
   readonly visitjejuContentId: string | null
   readonly sourceType: 'visitjeju' | 'naver'
   readonly naverSourceUrl: string | null
   readonly naverSnippet: string | null
   readonly authenticityScore: number | null
   readonly ordinarinessScore: number | null
   readonly aiEstimatedScore: number | null
   readonly aiEstimatedAt: string | null  // ISO timestamp
   readonly syntheticId: string | null    // §0-A: ApproveCandidateUseCase 실행 시 채움
   ```
3. `src/domain/ports/CurationDecisionRepository.ts` 인터페이스 작성:
   ```typescript
   export interface CurationDecisionRepository {
     save(decision: CurationDecision): Promise<void>
     findByCandidateId(candidateId: string): Promise<CurationDecision | undefined>
   }
   ```
4. `CurationDecision` 도메인 타입 작성 (`src/domain/curation/CurationDecision.ts`)
5. `typecheck` 통과 확인

**예상:** 2h

---

### Phase B: Infrastructure Adapters

공통 모킹 패턴:
- HTTP API (비짓제주, 네이버, 카카오): MSW `setupServer()` (기존 KakaoAuthAdapter.test.ts 패턴)
- Anthropic client: `vi.fn()` 스파이로 `messages.create` 반환값 제어
- 각 adapter는 Port 인터페이스 구현 (`implements` 명시)

---

#### B1 — VisitjejuAdapter (Red → Green)
**커밋 B1a:** `test(visitjeju): failing tests for VisitjejuAdapter`  
**커밋 B1b:** `feat(visitjeju): VisitjejuAdapter implements VisitjejuApiPort`

**Red 테스트 (B1a):**
```typescript
// src/infrastructure/visitjeju/VisitjejuAdapter.test.ts
describe('VisitjejuAdapter', () => {
  it('fetchAll yields VisitjejuRawSpot for each page', async () => { ... })
  it('stops after maxPages on 429', async () => { ... })
  it('maps repPhoto to null when missing', async () => { ... })
})
```
MSW로 `/vsjApi/contents/searchList` 응답 stub. 페이지네이션(pageNo, totalCount 기반) 검증.

**Green (B1b):** `axios` 기반 구현. `VISITJEJU_API_KEY` env 의존. pageSize=100, maxPages=50 (5,000개 상한). 429 시 2회 backoff retry.

**예상:** 3h

---

#### B2 — NaverSearchAdapter (Red → Green)
**커밋 B2a:** `test(naver): failing tests for NaverSearchAdapter`  
**커밋 B2b:** `feat(naver): NaverSearchAdapter implements NaverSearchApiPort`

**Red 테스트 (B2a):**
```typescript
describe('NaverSearchAdapter', () => {
  it('searchBlog returns NaverSearchResult with items', async () => { ... })
  it('searchCafe returns NaverSearchResult with items', async () => { ... })
  it('strips HTML tags from description', async () => { ... })
  it('stops when daily quota exhausted (remainingRequests === 0)', async () => { ... })
})
```
MSW로 `https://openapi.naver.com/v1/search/blog`, `/cafe` stub.

**Green (B2b):** `axios` 기반. `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` env. HTML 태그 제거(`description.replace(/<[^>]+>/g, '')`). quota 추적: 응답 헤더 `X-RateLimit-Remaining` 확인, 0이면 throw `NaverQuotaExhaustedError`. `src/config/naver-queries.json` 로드.

**예상:** 3h

---

#### B3 — LlmExtractorAdapter (Red → Green)
**커밋 B3a:** `test(llm): failing tests for LlmExtractorAdapter`  
**커밋 B3b:** `feat(llm): LlmExtractorAdapter + prompt`

**Red 테스트 (B3a):**
```typescript
describe('LlmExtractorAdapter', () => {
  it('extract returns LlmExtraction with scores in 0–1 range', async () => { ... })
  it('returns spot_name=null when snippet has no identifiable place', async () => { ... })
  it('returns authenticity_score<0.3 for ad-like snippet', async () => { ... })
  it('returns ordinariness_score>0.7 for 성산일출봉 mention', async () => { ... })
})
```
`anthropic.messages.create` → `vi.fn()` mockResolvedValue (tool_use block 구조).

**Green (B3b):**
- `src/infrastructure/llm/prompts/llm-extractor.prompt.ts` — system prompt (Zarei 2020 광고 신호, 패키지 negative examples)
- `tool_use` schema: `LlmExtractionSchema` (Zod 또는 수동 JSON schema)
- 모델: `claude-opus-4-7`

**예상:** 4h (prompt 설계 포함)

---

#### B4 — KakaoLocalVerifier (Red → Green)
**커밋 B4a:** `test(kakao): failing tests for KakaoLocalVerifier`  
**커밋 B4b:** `feat(kakao): KakaoLocalVerifier implements KakaoLocalVerifierPort`

**Red 테스트 (B4a):**
```typescript
describe('KakaoLocalVerifier', () => {
  it('verify returns matched=true with kakaoPlaceId when found', async () => { ... })
  it('verify returns matched=false when no result', async () => { ... })
  it('uses hintLat/hintLng to filter nearby results', async () => { ... })
})
```
MSW로 `https://dapi.kakao.com/v2/local/search/keyword.json` stub.

**Green (B4b):** `KAKAO_REST_API_KEY` env. 반경 힌트 필터링: 반환 결과 중 hint 좌표와 거리 500m 이내를 `matched`로 판단 (없으면 `matched=false`). 기존 `KakaoLocalPlaceAdapter` 코드 참조하되 파일은 별개 유지.

**예상:** 3h

---

#### B5 — SpotMetaInfererAdapter (Red → Green)
**커밋 B5a:** `test(llm): failing tests for SpotMetaInfererAdapter`  
**커밋 B5b:** `feat(llm): SpotMetaInfererAdapter + prompt`

**Red 테스트 (B5a):**
```typescript
describe('SpotMetaInfererAdapter', () => {
  it('infer returns SpotMetaInference with 4 axes', async () => { ... })
  it('atmosphere field contains Korean text', async () => { ... })
  it('handles empty introduction gracefully', async () => { ... })
})
```
`anthropic.messages.create` → `vi.fn()` mock.

**Green (B5b):**
- `src/infrastructure/llm/prompts/spot-meta-inferer.prompt.ts`
- 4축(atmosphere, crowd_level, best_time, target_visitor) JSON tool_use 출력
- 모델: `claude-opus-4-7`

**예상:** 3h

---

### Phase C: Application Layer

#### C1 — CandidateDeduper (Red → Green)
**커밋 C1a:** `test(curation): failing tests for CandidateDeduper`  
**커밋 C1b:** `feat(curation): CandidateDeduper with Haversine + coord-round`

**Red 테스트 (C1a):**
```typescript
describe('CandidateDeduper', () => {
  it('isDuplicate returns false for first candidate', async () => { ... })
  it('isDuplicate returns true for naver candidate within 100m of visitjeju', async () => { ... })
  it('isDuplicate returns true for coord-round match', async () => { ... })
  it('visitjeju candidate is not marked duplicate of existing naver', async () => { ... })
  it('registers coordinate after non-duplicate result', async () => { ... })
})
```
`CurationCandidateRepository.findAllWithCoordinates` → in-memory stub.

**Green (C1b):**
- Haversine 공식 (순수 함수, `src/application/curation/haversine.ts`)
- 초기화: `findAllWithCoordinates()` 호출 → 인메모리 Set 구성
- `isDuplicate(lat, lng, sourceType)`:
  1. 인메모리 Set에서 반경 100m 체크
  2. 좌표 round 체크 (`(lat * 1000 | 0) / 1000`)
  3. 중복 아니면 Set에 추가 + false 반환
- visitjeju 우선: 처리 순서는 호출자(`RunDiscoveryPipelineUseCase`)가 보장. Deduper 자체는 순서 무관.

**`CurationCandidateRepository` 포트 추가 (C1 포함):**
```typescript
findAllWithCoordinates(): Promise<Array<{ id: string; lat: number; lng: number; sourceType: string }>>
```
`PostgresCurationCandidateRepository`에 구현 추가.

**예상:** 3h

---

#### C2 — PersistCurationDecisionUseCase (Red → Green)
**커밋 C2a:** `test(curation): failing tests for PersistCurationDecisionUseCase`  
**커밋 C2b:** `feat(curation): PersistCurationDecisionUseCase`

**역할:** Label Studio webhook payload → `CurationDecision` 도메인 객체 → `CurationDecisionRepository.save()` → 결정에 따라 `ApproveCandidateUseCase` 또는 `RejectCandidateUseCase` 호출.

**Red 테스트 (C2a):**
```typescript
describe('PersistCurationDecisionUseCase', () => {
  it('approve decision calls ApproveCandidateUseCase and saves decision', async () => { ... })
  it('reject decision calls RejectCandidateUseCase with reason', async () => { ... })
  it('hold decision saves decision without approve/reject call', async () => { ... })
  it('approve requires curationScore 1–10', async () => { ... })
})
```
모든 의존 → `vi.fn()` 스파이.

**예상:** 2h

---

#### C3 — PostgresCurationDecisionRepository (Red → Green)
**커밋 C3a:** `test(persistence): failing tests for PostgresCurationDecisionRepository`  
**커밋 C3b:** `feat(persistence): PostgresCurationDecisionRepository`

**Red 테스트 (C3a):** in-memory mock pool 또는 testcontainers (기존 repositories.integration.test.ts 패턴). `save()` → `findByCandidateId()` round-trip 검증.

**예상:** 2h

---

#### C4 — ApproveCandidateUseCase 수정
**커밋:** `feat(curation): ApproveCandidateUseCase synthetic_id for kakao_unverified`

**변경 (§0-A 확정 사항 반영):**
```typescript
import { createHash } from 'crypto'

function buildSyntheticId(name: string, lat: number, lng: number): string {
  const payload = `${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`
  return 'synth_' + createHash('sha1').update(payload).digest('hex').slice(0, 12)
}

// ApproveCandidateUseCase.execute() 내부:
async execute({ candidateId, curationScore, curationComment }) {
  const candidate = await candidateRepo.findById(candidateId)
  // ...

  if (candidate.kakaoPlaceId !== null) {
    // 경로 A: kakao 검증 완료 → kakao_place_id 사용, synthetic_id null
    spot = createSpot({ kakaoPlaceId: candidate.kakaoPlaceId, syntheticId: null, ... })
  } else {
    // 경로 B: kakao_unverified → synthetic_id 생성, kakao_place_id null
    const syntheticId = buildSyntheticId(candidate.name, lat, lng)
    await candidateRepo.setSyntheticId(candidateId, syntheticId)  // 이력 저장
    spot = createSpot({ kakaoPlaceId: null, syntheticId, ... })
  }
}
```

**`Spot` 도메인 타입 추가:**
```typescript
// src/domain/spot/Spot.ts — 기존 수정
readonly kakaoPlaceId: string | null  // nullable로 변경
readonly syntheticId: string | null   // 신규
```

**`CurationCandidateRepository` 포트 추가 (C4 포함):**
```typescript
setSyntheticId(id: string, syntheticId: string): Promise<void>
```

**추가 테스트 케이스 (기존 파일에 추가):**
```typescript
it('creates spot with syntheticId and null kakaoPlaceId for kakao_unverified', async () => { ... })
it('creates spot with kakaoPlaceId and null syntheticId for verified candidate', async () => { ... })
it('syntheticId is deterministic for same name+lat+lng', async () => { ... })
```

**예상:** 2h

---

#### C5 — RunDiscoveryPipelineUseCase (Red → Green)
**커밋 C5a:** `test(curation): failing tests for RunDiscoveryPipelineUseCase`  
**커밋 C5b:** `feat(curation): RunDiscoveryPipelineUseCase orchestrates Stage 1–5`

**오케스트레이션 흐름:**
```
1. VisitjejuAdapter.fetchAll() → visitjejuSpots[]
2. NaverSearchAdapter.searchBlog/searchCafe() × 50 queries → naverItems[]
3. [visitjejuSpots 먼저] CandidateDeduper 초기화 (기존 DB 좌표 로드)
4. visitjejuSpots 순서로 처리:
     - KakaoLocalVerifier.verify(title, lat, lng)
     - CandidateDeduper.isDuplicate(lat, lng, 'visitjeju')
     - 통과 → CurationCandidateRepository.save(candidate, 'pending')
5. naverItems 순서로 처리:
     - spot_name null이면 skip (AC-2)
     - LlmExtractor.extract(snippet, query)
     - KakaoLocalVerifier.verify(spot_name, null, null)
     - CandidateDeduper.isDuplicate(lat || null, lng || null, 'naver')
     - 통과 → CurationCandidateRepository.save(candidate, 'pending')
6. { queued, skippedDedup, skippedKakaoUnverified } 반환
```

**Red 테스트 (C5a):**
```typescript
describe('RunDiscoveryPipelineUseCase', () => {
  it('saves visitjeju candidates in pending status', async () => { ... })
  it('skips naver candidate with null spot_name', async () => { ... })
  it('skips naver candidate that duplicates visitjeju within 100m', async () => { ... })
  it('saves kakao_unverified candidate when kakao returns no match', async () => { ... })
  it('returns correct queued/skipped counts', async () => { ... })
})
```
모든 포트 → `vi.fn()`. 5개 핵심 시나리오.

**예상:** 4h

---

### Phase D: Infrastructure — Embedding + Labeling

#### D1 — EmbeddingBatcher (Red → Green)
**커밋 D1a:** `test(embedding): failing tests for EmbeddingBatcher`  
**커밋 D1b:** `feat(embedding): EmbeddingBatcher with SpotMetaInferer + Voyage`

**Red 테스트 (D1a):**
```typescript
describe('EmbeddingBatcher', () => {
  it('run processes all spots without embedding', async () => { ... })
  it('concat = introduction + tags + SpotMetaInferer output', async () => { ... })
  it('updates spots.embedding via SpotRepository', async () => { ... })
  it('records failed spots without throwing', async () => { ... })
  it('runSingle processes one spot by id', async () => { ... })
})
```
`SpotMetaInfererPort` → `vi.fn()`. Voyage client → `vi.fn()`.

**Green (D1b):** `VOYAGE_API_KEY` env. `voyage-3-large` 모델. concat 형식: `${introduction}\n\n태그: ${tags}\n\n분위기: ${atmosphere}\n혼잡도: ${crowd_level}\n추천 시간: ${best_time}\n고객층: ${target_visitor}`.

**예상:** 3h

---

#### D2 — LabelStudioBridge (Red → Green)
**커밋 D2a:** `test(labeling): failing tests for LabelStudioBridge`  
**커밋 D2b:** `feat(labeling): LabelStudioBridge webhook handler`

**Label Studio webhook payload 구조 (Classification 템플릿):**
```json
{
  "action": "ANNOTATION_CREATED",
  "annotation": {
    "result": [
      { "value": { "choices": ["approve"] }, "from_name": "decision" },
      { "value": { "number": 8 }, "from_name": "curation_score" },
      { "value": { "choices": ["ordinary"] }, "from_name": "rejection_reason" },
      { "value": { "text": "..." }, "from_name": "rejection_reason_text" }
    ]
  },
  "task": { "data": { "candidate_id": "uuid" } }
}
```

**Red 테스트 (D2a):**
```typescript
describe('LabelStudioBridge', () => {
  it('parses approve annotation and calls PersistCurationDecisionUseCase', async () => { ... })
  it('parses reject annotation with reason', async () => { ... })
  it('throws on unknown action', async () => { ... })
  it('throws if decision annotation missing', async () => { ... })
})
```

**예상:** 3h

---

### Phase E: API Routes + DI 연결

#### E1 — Pipeline Route + Candidates Routes
**커밋:** `feat(routes): phase0-pipeline and candidates admin routes`

```typescript
// POST /api/v1/admin/curation/pipeline/run
// GET  /api/v1/admin/curation/candidates  ?status&limit&offset
// GET  /api/v1/admin/curation/candidates/:id
```

`AppDependencies`에 신규 어댑터 DI 연결:
- `VisitjejuAdapter(process.env.VISITJEJU_API_KEY)`
- `NaverSearchAdapter(process.env.NAVER_CLIENT_ID, process.env.NAVER_CLIENT_SECRET)`
- `LlmExtractorAdapter(anthropicClient)`
- `KakaoLocalVerifier(process.env.KAKAO_REST_API_KEY)`
- `CandidateDeduper(candidateRepo)`
- `RunDiscoveryPipelineUseCase(...all ports)`

인증: 기존 `DevAuthProvider role=curator` 미들웨어 재사용.

**예상:** 2h

---

#### E2 — Labeling Webhook Route
**커밋:** `feat(routes): labeling webhook route with secret validation`

```typescript
// POST /api/v1/admin/labeling/webhook
// Header: X-Label-Studio-Token: {LABEL_STUDIO_WEBHOOK_SECRET}
```

secret 불일치 → 401. `LabelStudioBridge.handleWebhook(body)` 호출.

**예상:** 1h

---

#### E3 — Embedding Batch Route
**커밋:** `feat(routes): embedding batch admin route`

```typescript
// POST /api/v1/admin/embedding/batch
// Body: { spotIds?: string[] }
// Response: EmbeddingBatchResult
```

`SpotMetaInfererAdapter` + `EmbeddingBatcher` DI 연결.

**예상:** 1h

---

### Phase F: Config + Scripts

#### F1 — naver-queries.json
**커밋:** `feat(config): naver-queries.json with 10 placeholder queries`

```json
{
  "$schema": "./naver-queries.schema.json",
  "queries": [
    "제주 한경면 카페",
    "우도 숨은 맛집",
    "제주 체험 비추천",
    "애월 로컬 카페",
    "서귀포 숨은 오름",
    "제주 게스트하우스 주변 맛집",
    "협재 해수욕장 근처 카페",
    "제주 중산간 드라이브 코스",
    "성산 일대 비관광지 코스",
    "제주 로컬 체험 프로그램"
  ],
  "_note": "큐레이터가 직접 편집. 최종 50개로 확장. OQ-4 결정 참조."
}
```

**예상:** 30m

---

#### F2 — embed:batch Script
**커밋:** `feat(scripts): embed:batch npm script`

`scripts/embed-batch.ts`: CLI entry point. `--spot-ids` flag 파싱 → `EmbeddingBatcher.run(spotIds?)` 호출.

`package.json` 추가:
```json
"embed:batch": "tsx scripts/embed-batch.ts"
```

**예상:** 1h

---

### Phase G: E2E

#### G1 — Phase 0 Pipeline E2E (모든 외부 의존 모킹)
**커밋:** `test(e2e): phase0 pipeline end-to-end with mocked adapters`

**위치:** `tests/e2e/phase0-pipeline.test.ts`

**시나리오 1건 (AC-1 기반):**
```typescript
it('E2E: pipeline run queues visitjeju + naver candidates, skips dedup', async () => {
  // MSW: visitjeju 응답 5건, naver 응답 3건
  // vi.fn(): LlmExtractor 반환값 제어
  // vi.fn(): KakaoLocalVerifier 반환값 (2건 matched, 1건 unmatched)
  // vi.fn(): Voyage client
  
  const resp = await supertest(app)
    .post('/api/v1/admin/curation/pipeline/run')
    .set('Authorization', devCuratorToken)
    .send({})
  
  expect(resp.status).toBe(200)
  expect(resp.body.queued).toBeGreaterThan(0)
  expect(resp.body.skippedDedup).toBeGreaterThanOrEqual(0)
  
  // DB 확인: curation_candidates에 pending 행 존재
  const candidates = await db.query("SELECT * FROM curation_candidates WHERE status = 'pending'")
  expect(candidates.rows.length).toBeGreaterThan(0)
})
```

기존 E2E 5건 회귀 없음 확인 (tagalong.test.ts).

**예상:** 3h

---

## 6. 완료 기준 — Spec AC 매핑

| AC | 검증 태스크 | 방법 |
|---|---|---|
| AC-1: 파이프라인 실행 | G1 e2e | `POST /pipeline/run` → DB `pending` 행 존재 |
| AC-2: LLM 점수화 | B3 unit | `authenticity_score`·`ordinariness_score` 0–1 범위 |
| AC-3: Label Studio 연동 | D2 unit + E2 route | webhook → `curation_decisions` 1행 삽입 |
| AC-4: Embedding 배치 | D1 unit + E3 route | `spots.embedding IS NOT NULL` 행 증가 |
| AC-5: 거절 사유 수집 | C2 unit | `rejection_reason_enum`·`text` 저장 확인 |
| AC-6: 수량 KPI 없음 | C5 unit | `queued` 카운트만 반환, 강제 기준 없음 확인 |

---

## 7. 요약

| 항목 | 값 |
|---|---|
| 총 커밋 | **27개** |
| TDD Red 커밋 | 12개 (B1a~B5a, C1a~C2a, C5a, D1a~D2a) |
| TDD Green 커밋 | 12개 (대응 b 커밋) |
| 기타 커밋 | 3개 (A1 migration, A2 types, C4 기존 수정) + 3개 routes + 2개 config + 1개 e2e |
| 신규 파일 | ~35개 (ts 소스 20 + test 13 + sql 2) |
| 수정 파일 | ~6개 (CurationCandidate, ApproveCandidateUseCase, CurationCandidateRepository, AppDependencies, package.json) |
| 예상 소요 | **~43h** (약 6~7 작업일, 8h/일 기준) |
| 기존 테스트 회귀 | 없음 (245건 유지, 신규 ~65건 추가 → 총 ~310건) |

### Phase별 예상 시간

| Phase | 내용 | 예상 |
|---|---|---|
| A | Foundation (migration + types) | 3h |
| B | Infrastructure Adapters 5개 | 16h |
| C | Application Layer (deduper + use cases + repo) | 12.5h |
| D | Embedding + Labeling | 6h |
| E | API Routes + DI | 4h |
| F | Config + Scripts | 1.5h |
| G | E2E | 3h |
| **계** | | **46h** |

### 의존 관계 기반 병렬화 가능 구간

A1 → A2 완료 후:
- B1(Visitjeju) + B2(Naver) + B5(SpotMetaInferer) 독립 → **병렬 가능**
- B3(LlmExtractor) + B4(KakaoLocalVerifier) 독립 → **병렬 가능**

B 완료 후:
- C1(CandidateDeduper) + C2(PersistDecisionUseCase) + C3(DecisionRepo) → **병렬 가능**

C5(RunDiscoveryPipelineUseCase)는 B1~B5 + C1 완료 후 착수.
