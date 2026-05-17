# Plan — Curation Pipeline

**Feature:** 큐레이션 파이프라인 + 두 트랙 추천 응답  
**Stage:** 4 — Plan  
**Spec:** `specs/curation-pipeline.md`  
**ADRs:** ADR-0017 (two-track), ADR-0018 (TrendSource ACL)  
**OQ 결정:** OQ-CUR-1 z-score / OQ-CUR-2 수동 trigger / OQ-CUR-3 3-phase 시드 / OQ-CUR-4 일 배치  
**Date:** 2026-05-18  

---

## 0. 핵심 제약

- 코드 작성 없음. 이 문서는 구현 청사진.  
- 기존 core-flow 도메인(5 use cases, 183 unit + 5 E2E 테스트) 회귀 없음.  
- Spot 스키마 변경 시 cold-start 경로(`findTopByCurationScore`) 보존.  
- Phase D의 Recommender 인터페이스 변경은 `GetRecommendationsUseCase` + `ComposeDayPlanService` 동시 교체 — partial 상태 없도록 단일 커밋.  

---

## 1. 현재 상태 (as-is)

### 1.1 Spot 스키마 (migration 003, 이미 배포)

```
spots(
  id UUID, kakao_place_id TEXT UNIQUE,
  name TEXT, region TEXT, category TEXT, price_range TEXT,
  curation_score SMALLINT,   ← 이미 존재
  popularity_score SMALLINT, ← 이미 존재
  curation_comment TEXT, lat FLOAT8, lng FLOAT8,
  thumbnail_url TEXT, embedding VECTOR(1024),
  is_active BOOLEAN, updated_at TIMESTAMPTZ
)
```

`trend_score` 컬럼 없음. `Spot` 인터페이스도 `trendScore` 없음.

### 1.2 Recommender (as-is)

```typescript
// src/domain/recommender/Recommender.ts
interface Recommender {
  recommendForShortlist(context: RecommendationContext): Promise<Spot[]>;
}

// src/domain/recommender/RecommendationContext.ts
interface RecommendationContext {
  readonly traveller: Traveller;
  readonly trip: Trip;
  readonly preferences: SpotPreferences;
}
```

단일 `Spot[]` 반환. `CalibrationProfile` 없음.

### 1.3 GetRecommendationsUseCase (as-is)

```typescript
// GetRecommendationsOutput
{ spots: SpotOutput[]; total: number; coldStart: boolean }
```

### 1.4 E2E 테스트 현황

`tests/e2e/tagalong.test.ts` — E1~E5 (5개). `GET /recommendations` 엔드포인트에 대한 직접 응답 구조 검증 없음. `getRecommendationsUseCase`는 setup에서 주입만 됨. Phase D 변경 후 해당 테스트 **추가 필요**.

---

## 2. 아키텍처 다이어그램

### 2.1 발굴 흐름

```
POST /api/v1/admin/curation/discover
  └─ DiscoverCandidatesUseCase
       ├─ TrendDataSourcePort (ACL)
       │    ├─ DatalabVisitkoreaAdapter  ← SNS 언급량 TOP100
       │    └─ JejuTourismBigdataAdapter ← 카드매출 TOP15
       └─ CandidateDiscovererService
            ├─ kakaoPlaceId 중복 제거 (기존 spots + curation_candidates)
            ├─ 임계치 미만 필터 (trendSignal < threshold)
            └─ CurationCandidateRepository.save(status: pending)
```

```
POST /api/v1/admin/curation/candidates/:id/enrich  (선택적 수동 호출)
  └─ EnrichCandidateUseCase
       └─ LLMEnricherPort
            └─ AnthropicLLMEnricherAdapter
                 └─ CurationCandidate { llmSummary, llmTags } 업데이트
```

### 2.2 승인/거절 흐름

```
POST /api/v1/admin/curation/candidates/:id/approve
  └─ ApproveCandidateUseCase
       └─ CurationCandidate (pending → approved)
            └─ Spot 생성 (curationScore, is_active=true)
                 └─ SpotRepository.save → 즉시 Recommender 노출

DELETE /api/v1/admin/curation/candidates/:id
  └─ RejectCandidateUseCase
       └─ CurationCandidateRepository.delete(id)
```

### 2.3 배치 점수 동기화 흐름 (OQ-CUR-4: 일 배치)

```
scripts/sync-spot-scores.ts (cron KST 03:00)
  └─ SyncSpotScoresUseCase
       ├─ TrendDataSourcePort → TrendSignal[]
       │    ├─ DatalabVisitkoreaAdapter.fetch()  → { spotId, trendSignal }
       │    ├─ JejuTourismBigdataAdapter.fetch() → { spotId, popularitySignal }
       │    └─ KakaoMapRatingAdapter.fetch()     → { spotId, ratingSignal } (fallback)
       ├─ PopularityScoreCalculator.compute(signals) → z-score 합산
       └─ SpotRepository.updateScores(spotId, { popularityScore, trendScore })
```

### 2.4 추천 흐름 (Phase D 이후)

```
GET /api/v1/trips/:tripId/recommendations
  └─ GetRecommendationsUseCase (v2)
       └─ resolveOwnedTrip(authService, tripRepo, token, tripId)
            └─ ShortlistRepository.findByTravellerId
                 └─ SpotPreferences.fromShortlist
                      └─ CalibrationProfileRepository.findByTravellerId
                           └─ Recommender.recommendForShortlist(context) → RecommendationResult
                                ├─ curatedPicks: curationScore DESC, SpotPreferences 필터
                                └─ popularSpots: (popularityScore + trendScore) weighted, 혼잡도 saturation down-rank
                                     → { curatedPicks: RecommendationSection, popularSpots: RecommendationSection }
```

---

## 3. 도메인 모델 변경

### 3.1 신규 엔티티 / VO

#### `CurationCandidate` (Entity)

```typescript
// src/domain/curation/CurationCandidate.ts
interface CurationCandidate {
  readonly id: string;
  readonly kakaoPlaceId: string;
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly llmSummary: string | null;       // silver label
  readonly llmTags: string[];               // silver label
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly discoveredAt: CalendarDate;
  readonly sourcedFrom: string;             // 'discovery-datalab' | 'discovery-ijto' | 'manual'
  // enrichment 후 채워지는 필드 (승인 전 필수)
  readonly lat: number | null;
  readonly lng: number | null;
  readonly thumbnailUrl: string | null;
  readonly priceRange: string | null;
  readonly enrichedAt: CalendarDate | null; // null이면 미완료 enrichment
}
```

- `kakaoPlaceId` UNIQUE — 중복 방지 키
- `status` 전이: `pending → approved | rejected`. `approved → rejected` 허용 (큐레이터 회수)
- `approved → rejected` 시 연결된 `Spot.isActive = false` + `curationScore = 0` (트랜잭션)
- `approved` 시 `Spot` 레코드 생성 후 candidate는 보존 (audit trail)
- `rejected` 시 소프트 삭제 (status='rejected', 행 보존 — audit trail 유지)
- 승인 가드: `enrichedAt` null이면 `ApproveError('NotEnriched')` throw; lat·lng·thumbnailUrl 누락 시 `ApproveError('IncompleteEnrichment')`

#### `CalibrationProfile` (Value Object)

```typescript
// src/domain/recommender/CalibrationProfile.ts
class CalibrationProfile {
  private constructor(
    readonly curatedRatio: number,      // 0.0 ~ 1.0
    readonly isUserAdjusted: boolean,
  )
  static default(): CalibrationProfile                          // { 0.5, false }
  static fromUserInput(ratio: number): CalibrationProfile       // { ratio, true } — throws if ratio < 0 || > 1
  get popularRatio(): number                                     // 1 - curatedRatio
  toJSON(): { curatedRatio: number; popularRatio: number; isUserAdjusted: boolean }
}
```

- 불변 VO — 조정은 new instance 반환
- `withNegativeIntent` 제거 (D3 결정 — OQ-FUTURE-1로 추적, 현재 슬라이더 수동만)

#### `RecommendationSection` (Value Object)

```typescript
// src/domain/recommender/RecommendationSection.ts
interface RecommendationSection {
  readonly kind: 'curated' | 'popular';
  readonly spots: readonly Spot[];
  readonly coldStart: boolean;
}
```

#### `RecommendationResult` (Value Object)

```typescript
// src/domain/recommender/RecommendationResult.ts
interface RecommendationResult {
  readonly curatedPicks: RecommendationSection;
  readonly popularSpots: RecommendationSection;
}
```

#### `TrendSignal` (Value Object, score-sync 전용 — ADR-0018)

```typescript
// src/domain/ports/TrendDataSourcePort.ts
interface TrendSignal {
  readonly spotId: string;             // 기존 Spot ID (score-sync 전용)
  readonly popularitySignal: number;   // z-score 정규화 후 0–100 클리핑
  readonly trendSignal: number;        // z-score 정규화 후 0–100 클리핑
  readonly fetchedAt: CalendarDate;
}
```

> `TrendSignal.spotId`는 이미 DB에 있는 Spot을 참조. 신규 장소 발굴에는 사용 불가.

#### `TrendCandidate` (Value Object, discovery 전용 — CM-1)

```typescript
// src/domain/ports/TrendDiscoveryPort.ts
interface TrendCandidate {
  readonly kakaoPlaceId: string;    // Kakao 장소 ID — 중복 방지 키
  readonly name: string;
  readonly region: Region;
  readonly category: string;
  readonly trendSignal: number;     // 0–100
  readonly sourcedFrom: string;     // 'discovery-datalab' | 'discovery-ijto'
}
```

### 3.2 기존 엔티티 수정

#### `Spot` 인터페이스 (`src/domain/spot/Spot.ts`)

추가 필드:
```typescript
readonly trendScore: number;   // 기존 curationScore, popularityScore와 나란히
```

변경 없는 필드: `id`, `kakaoPlaceId`, `name`, `region`, `category`, `priceRange`,
`curationScore`, `popularityScore`, `curationComment`, `thumbnailUrl`, `lat`, `lng`.

#### `Recommender` 포트 (`src/domain/recommender/Recommender.ts`)

```typescript
// 변경 전
interface Recommender {
  recommendForShortlist(context: RecommendationContext): Promise<Spot[]>;
}

// 변경 후
interface Recommender {
  recommendForShortlist(context: RecommendationContext): Promise<RecommendationResult>;
}
```

#### `RecommendationContext` (`src/domain/recommender/RecommendationContext.ts`)

```typescript
// 변경 후
interface RecommendationContext {
  readonly traveller: Traveller;
  readonly trip: Trip;
  readonly preferences: SpotPreferences;
  readonly calibration: CalibrationProfile;  // 추가
}
```

### 3.3 신규 포트 인터페이스

#### `TrendDiscoveryPort` (discovery 전용 — CM-1)

```typescript
// src/domain/ports/TrendDiscoveryPort.ts
interface TrendDiscoveryPort {
  fetchCandidatesByRegion(region?: Region, category?: string, limit?: number): Promise<TrendCandidate[]>;
  readonly sourceName: string;
}
```

> 기존 `TrendDataSourcePort`는 score-sync 전용으로 유지. 어댑터(Datalab, IJTO)는 두 인터페이스 모두 구현.

#### `TrendDataSourcePort` (score-sync 전용 — ADR-0018)

```typescript
// src/domain/ports/TrendDataSourcePort.ts
interface TrendDataSourcePort {
  fetchSignalsForSpots(spotIds: string[]): Promise<TrendSignal[]>;
  readonly sourceName: string;
}
```

#### `LLMEnricherPort`

```typescript
// src/application/ports/LLMEnricherPort.ts
interface LLMEnricherPort {
  enrich(candidate: CurationCandidate): Promise<{
    summary: string;
    tags: string[];
    priceRange: string | null;  // LLM이 리뷰·메뉴 텍스트에서 추정
  }>;
}
```

#### `KakaoLocalApiPort` (CM-2 신규)

```typescript
// src/application/ports/KakaoLocalApiPort.ts
interface KakaoLocalApiPort {
  fetchPlaceDetails(kakaoPlaceId: string): Promise<{
    lat: number;
    lng: number;
    thumbnailUrl: string;
  } | null>;
}
```

#### `CurationCandidateRepository`

```typescript
// src/domain/ports/CurationCandidateRepository.ts
interface CurationCandidateRepository {
  findById(id: string): Promise<CurationCandidate | undefined>;
  findByStatus(status: 'pending' | 'approved' | 'rejected', opts?: { limit: number; offset: number }): Promise<CurationCandidate[]>;
  existsByKakaoPlaceId(kakaoPlaceId: string): Promise<boolean>;
  findExistingKakaoPlaceIds(kakaoPlaceIds: string[]): Promise<Set<string>>;  // P1 배치 체크
  save(candidate: CurationCandidate): Promise<void>;
}
```

> `delete` 메서드 제거 — A1 결정으로 소프트 삭제 채택 (status='rejected' 업데이트)

#### `CalibrationProfileRepository`

```typescript
// src/domain/ports/CalibrationProfileRepository.ts
interface CalibrationProfileRepository {
  findByTripId(tripId: string): Promise<CalibrationProfile>;  // missing → CalibrationProfile.default() (D2 per-trip)
  save(tripId: string, profile: CalibrationProfile): Promise<void>;
}
```

---

## 4. DB 마이그레이션

### 4.1 마이그레이션 목록

| # | 파일 | 내용 | Phase |
|---|------|------|-------|
| 009 | `009_up_spot_trend_score.sql` | `spots`에 `trend_score` 컬럼 추가 | A |
| 010 | `010_up_curation_candidates.sql` | `curation_candidates` 테이블 | B |
| 011 | `011_up_calibration_profiles.sql` | `calibration_profiles` 테이블 | D |
| 012 | `012_up_trend_sources.sql` | `trend_sources` 테이블 (배치 추적) | C |

> 주의: 009는 "score rename"이 아님. `curation_score`·`popularity_score`는 이미 migration 003에 존재. 009는 `trend_score` 신규 추가만.

### 4.2 009_up_spot_trend_score.sql

```sql
-- up
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS trend_score SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS spots_popularity_score_idx ON spots(popularity_score DESC);
CREATE INDEX IF NOT EXISTS spots_trend_score_idx      ON spots(trend_score DESC);
```

```sql
-- down (009_down_spot_trend_score.sql)
DROP INDEX IF EXISTS spots_trend_score_idx;
DROP INDEX IF EXISTS spots_popularity_score_idx;
ALTER TABLE spots DROP COLUMN IF EXISTS trend_score;
```

- cold-start 경로(`findTopByCurationScore`) 영향 없음 — `curation_score` 컬럼 불변.
- 기존 15개 시드 픽스처: `trend_score DEFAULT 0`으로 자동 채움.

### 4.3 010_up_curation_candidates.sql

```sql
-- up
CREATE TABLE IF NOT EXISTS curation_candidates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_place_id   TEXT        UNIQUE NOT NULL,
  name             TEXT        NOT NULL,
  region           TEXT        NOT NULL CHECK (region IN ('jeju-city','eastern','seogwipo','western','hallasan')),
  category         TEXT        NOT NULL,
  llm_summary      TEXT,
  llm_tags         TEXT[]      NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  discovered_at    DATE        NOT NULL,
  sourced_from     TEXT        NOT NULL,
  -- enrichment fields (CM-2 — ApproveCandidateUseCase 승인 전 필수)
  lat              FLOAT8,
  lng              FLOAT8,
  thumbnail_url    TEXT,
  price_range      TEXT,
  enriched_at      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidates_status_idx ON curation_candidates(status);
CREATE INDEX IF NOT EXISTS candidates_created_idx ON curation_candidates(created_at DESC);
```

```sql
-- down
DROP TABLE IF EXISTS curation_candidates;
```

### 4.4 011_up_calibration_profiles.sql

```sql
-- up
CREATE TABLE IF NOT EXISTS calibration_profiles (
  trip_id           UUID    PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,  -- D2: per-trip
  curated_ratio     FLOAT8  NOT NULL DEFAULT 0.5
                            CHECK (curated_ratio BETWEEN 0.0 AND 1.0),
  is_user_adjusted  BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
-- down
DROP TABLE IF EXISTS calibration_profiles;
```

### 4.5 012_up_trend_sources.sql

```sql
-- up
CREATE TABLE IF NOT EXISTS trend_sources (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name     TEXT        UNIQUE NOT NULL,
  last_fetched_at TIMESTAMPTZ,
  last_status     TEXT        NOT NULL DEFAULT 'never'
                              CHECK (last_status IN ('never','success','failure')),
  consecutive_failures INT   NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO trend_sources (source_name) VALUES
  ('datalab-visitkorea'),
  ('jeju-tourism-bigdata'),
  ('kakao-map-rating')
ON CONFLICT (source_name) DO NOTHING;
```

```sql
-- down
DROP TABLE IF EXISTS trend_sources;
```

---

## 5. 어댑터 (infrastructure 레이어)

### 5.1 TrendDataSource 어댑터

#### `DatalabVisitkoreaAdapter`

```
src/infrastructure/trend/DatalabVisitkoreaAdapter.ts
```

- 구현: `TrendDataSourcePort`
- `sourceName = 'datalab-visitkorea'`
- API: `datalab.visitkorea.or.kr` SNS 언급량·키워드 트렌드
- 인증: API key (env: `DATALAB_API_KEY`)
- 정규화: SNS 언급량 → z-score (0~100)
- 실패 시: empty `TrendSignal[]` 반환 + `TrendSource.status = failure` 기록

#### `JejuTourismBigdataAdapter`

```
src/infrastructure/trend/JejuTourismBigdataAdapter.ts
```

- 구현: `TrendDataSourcePort`
- `sourceName = 'jeju-tourism-bigdata'`
- API: `data.ijto.or.kr` 카드매출 TOP15, 내비 차량 분포, 이동통신 혼잡도
- 인증: API key (env: `IJTO_API_KEY`)
- 정규화: 3개 신호 각각 z-score, `popularitySignal = z(카드매출) + z(내비) + z(통신)` (OQ-CUR-1)
- 가중치 config 외부화: `POPULARITY_WEIGHTS=1:1:1` (env, 튜닝 가능)
- 실패 시: empty 반환 + fallback 트리거

#### `KakaoMapRatingAdapter`

```
src/infrastructure/trend/KakaoMapRatingAdapter.ts
```

- 구현: `TrendDataSourcePort`
- `sourceName = 'kakao-map-rating'`
- API: Kakao Map API 평점·리뷰 수
- 인증: `KAKAO_REST_API_KEY`
- 역할: OQ-CUR-1 fallback — 공공 데이터 fetch 실패 시 호출
- 정규화: `z(리뷰 수) + z(평점 × 20)` → popularitySignal

> `KakaoAuthAdapter` (`src/infrastructure/kakao/KakaoAuthAdapter.ts`)와 별개 어댑터. Kakao Map API ≠ Kakao Auth API.

#### `PopularityScoreCalculator` (순수 함수, infrastructure 불필요)

```
src/domain/curation/PopularityScoreCalculator.ts
```

```typescript
function computeZScore(values: number[]): number[]
function computePopularityScore(
  signals: { cardSales: number; navi: number; mobility: number },
  weights: { w1: number; w2: number; w3: number }
): number
```

- 순수 함수 → 단위 테스트 쉬움
- `weights`는 config에서 주입 (default 1:1:1)

### 5.2 LLM Enricher 어댑터

#### `AnthropicLLMEnricherAdapter`

```
src/infrastructure/llm/AnthropicLLMEnricherAdapter.ts
```

- 구현: `LLMEnricherPort`
- 모델: `claude-haiku-4-5-20251001` (LLMParseFreeTextAdapter와 동일 모델 — 비용 최적)
- 입력: `CurationCandidate` (name, region, category)
- 출력: `{ summary: string; tags: string[] }` (한국어 요약 + 카테고리 태그)
- 비용 추적: per-call log (stdout JSON) — `{ model, inputTokens, outputTokens, estimatedCost }`
- Reuse: `@anthropic-ai/sdk` (이미 dependency)

### 5.3 Recommender 어댑터 수정

#### `PostgresRecommenderAdapter` (수정)

```
src/infrastructure/recommender/PostgresRecommenderAdapter.ts
```

변경: `recommendForShortlist` 반환형 `Spot[]` → `RecommendationResult`.

```typescript
async recommendForShortlist(context: RecommendationContext): Promise<RecommendationResult> {
  const [curatedSpots, popularSpots] = await Promise.all([
    this.recommendCurated(context),
    this.recommendPopular(context),
  ]);
  return {
    curatedPicks: { kind: 'curated', spots: curatedSpots, coldStart: context.preferences.isEmpty },
    popularSpots: { kind: 'popular', spots: popularSpots, coldStart: false },
  };
}

private async recommendCurated(context: RecommendationContext): Promise<Spot[]>
// SQL: WHERE is_active = true AND category IN (...preferences)
//      ORDER BY curation_score DESC
//      LIMIT Math.round(limit * calibration.curatedRatio)

private async recommendPopular(context: RecommendationContext): Promise<Spot[]>
// SQL: WHERE is_active = true
//      ORDER BY (popularity_score * w1 + trend_score * w2) DESC
//      LIMIT Math.round(limit * calibration.popularRatio)
```

- 두 트랙 `Promise.all` 병렬 — SLA 5초 유지 (OQ-CUR-4)
- `curatedPicks`에 나온 Spot은 `popularSpots`에서 제외 (중복 제거, curated 우선)
- saturation down-rank: `trend_score > threshold`이면 popularSpots 내에서 순위 하락 (threshold는 config)

### 5.4 CalibrationProfile 어댑터

#### `PostgresCalibrationProfileRepository`

```
src/infrastructure/persistence/PostgresCalibrationProfileRepository.ts
```

- 구현: `CalibrationProfileRepository`
- `findByTripId`: row 없으면 `CalibrationProfile.default()` 반환 (D2 per-trip)
- `save`: UPSERT on `trip_id`

---

## 6. Application 서비스 (Use Cases)

### 6.1 신규 Use Cases

#### `DiscoverCandidatesUseCase`

```
src/application/curation/DiscoverCandidatesUseCase.ts
```

```typescript
interface DiscoverCandidatesInput {
  region?: Region;
  category?: string;
  limit?: number;  // default 20
}
interface DiscoverCandidatesOutput {
  discovered: number;   // 신규 생성된 candidate 수
  skippedDuplicates: number;
}

class DiscoverCandidatesUseCase {
  constructor(
    private readonly discoveryPorts: TrendDiscoveryPort[],  // CM-1: TrendDiscoveryPort 사용
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
  )
}
```

로직:
1. 각 `TrendDiscoveryPort.fetchCandidatesByRegion(region, category, limit)` 병렬 호출 (CM-1)
2. `trendSignal >= DISCOVER_THRESHOLD` (env, default 60) 필터
3. **배치 중복 체크** (P1): 전체 kakaoPlaceId 수집 후 `spotRepo.findExistingKakaoPlaceIds(ids)` + `candidateRepo.findExistingKakaoPlaceIds(ids)` — DB 호출 2회 (N×2 → 2)
4. 신규만 `CurationCandidate(status: pending, enrichedAt: null)` 생성 후 저장

> 이 Use Case는 LLM enrichment와 위치 데이터 수집을 포함하지 않음. Enrichment는 별도 `EnrichCandidateUseCase` (선택 호출).

#### `EnrichCandidateUseCase`

```
src/application/curation/EnrichCandidateUseCase.ts
```

```typescript
interface EnrichCandidateInput { candidateId: string; }
interface EnrichCandidateOutput {
  summary: string;
  tags: string[];
  lat: number;
  lng: number;
  thumbnailUrl: string;
  priceRange: string | null;
}

class EnrichCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly llmEnricher: LLMEnricherPort,
    private readonly kakaoLocalApi: KakaoLocalApiPort,  // CM-2: 위치 데이터 수집
  )
}
```

로직:
1. `candidateRepo.findById` → not found: `CandidateNotFoundError`
2. `kakaoLocalApi.fetchPlaceDetails(kakaoPlaceId)` → lat, lng, thumbnailUrl (null이면 `EnrichmentError`)
3. `llmEnricher.enrich(candidate)` → summary, tags, priceRange
4. `candidateRepo.save({ ...candidate, lat, lng, thumbnailUrl, priceRange, enrichedAt: today, llmSummary: summary, llmTags: tags })`

#### `ApproveCandidateUseCase`

```
src/application/curation/ApproveCandidateUseCase.ts
```

```typescript
interface ApproveCandidateInput {
  candidateId: string;
  curationScore: number;    // 1–100
  curationComment?: string;
}
interface ApproveCandidateOutput { spotId: string; }

class ApproveCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,
  )
}
```

로직:
1. `candidateRepo.findById` → not found: `CandidateNotFoundError`
2. status !== 'pending': `InvalidStatusError` (이미 처리됨)
3. **승인 가드** (CM-2): `enrichedAt` null → `ApproveError('NotEnriched')`; lat·lng·thumbnailUrl 누락 → `ApproveError('IncompleteEnrichment')`
4. `Spot` 생성 (`curationScore`, `is_active=true`, `popularityScore=0`, `trendScore=0`, lat, lng, thumbnailUrl, priceRange)
5. `spotRepo.save(spot)` — idempotent: kakaoPlaceId UNIQUE → conflict = already approved, return existing spotId
6. `candidateRepo.save({ ...candidate, status: 'approved' })`

#### `RejectCandidateUseCase`

```
src/application/curation/RejectCandidateUseCase.ts
```

```typescript
interface RejectCandidateInput { candidateId: string; }

class RejectCandidateUseCase {
  constructor(
    private readonly candidateRepo: CurationCandidateRepository,
    private readonly spotRepo: SpotRepository,  // T1: approved→rejected cascade
  )
}
```

로직 (A1 소프트 삭제):
1. `candidateRepo.findById` → not found: `CandidateNotFoundError`
2. status === 'rejected': idempotent (no-op, return)
3. status === 'pending': `candidateRepo.save({ ...candidate, status: 'rejected' })`
4. status === 'approved': 트랜잭션으로 `spotRepo.deactivate(kakaoPlaceId)` (isActive=false, curationScore=0) + `candidateRepo.save({ ...candidate, status: 'rejected' })`

> `SpotRepository`에 `deactivate(kakaoPlaceId: string): Promise<void>` 메서드 추가 필요 (섹션 14 참조)

#### `SyncSpotScoresUseCase`

```
src/application/curation/SyncSpotScoresUseCase.ts
```

```typescript
interface SyncSpotScoresInput { dryRun?: boolean; }
interface SyncSpotScoresOutput {
  updated: number;
  failed: string[];  // sourceName[]
}

class SyncSpotScoresUseCase {
  constructor(
    private readonly trendSources: TrendDataSourcePort[],
    private readonly spotRepo: SpotRepository,
    private readonly trendSourceRepo: TrendSourceRepository,
  )
}
```

로직:
1. 각 소스 `fetchSignalsForSpots(activeSpotIds)` 병렬 실행 (`Promise.allSettled` — 부분 실패 허용, CM-1)
2. 성공한 소스의 `TrendSignal[]`만 합산
3. `PopularityScoreCalculator.computePopularityScore` 적용
4. `SpotRepository.updateScores(spotId, { popularityScore, trendScore })` — batch update
5. `TrendSourceRepository.updateStatus(sourceName, 'success' | 'failure', consecutiveFailures)`
6. `consecutiveFailures >= 3` → stdout `ALERT: TrendSource {name} failed 3 times` (알림 메커니즘 v2)

> `SpotRepository`에 `updateScores` 메서드 추가 필요:
> ```typescript
> updateScores(updates: { spotId: string; popularityScore: number; trendScore: number }[]): Promise<void>
> ```

### 6.2 수정 Use Cases

#### `GetRecommendationsUseCase` (v2)

```
src/application/core-flow/GetRecommendationsUseCase.ts
```

변경:
- constructor에 `CalibrationProfileRepository` 추가
- `RecommendationResult` 기반으로 응답 재구조화
- negative intent 파싱 제거 (D3 — OQ-FUTURE-1로 추적)
- `calibrationRepo.findByTripId(tripId)` 호출 (D2 per-trip)

```typescript
interface GetRecommendationsOutput {
  curatedPicks: {
    label: 'curatedPicks';
    spots: SpotOutput[];
    coldStart: boolean;
  };
  popularSpots: {
    label: 'popularSpots';
    spots: SpotOutput[];
    coldStart: boolean;
  };
  calibration: { curatedRatio: number; popularRatio: number };
}
```

> Breaking change: 기존 `{ spots[], total, coldStart }` → 두 섹션 구조.  
> E2E fixture 업데이트 대상: `tests/e2e/tagalong.test.ts` 내 recommendations 호출 추가.

#### `AdjustCalibrationUseCase` (신규)

```
src/application/curation/AdjustCalibrationUseCase.ts
```

```typescript
interface AdjustCalibrationInput {
  accessToken: string;
  tripId: string;
  curatedRatio: number;  // 0.0 ~ 1.0 (user explicit)
}
interface AdjustCalibrationOutput {
  curatedRatio: number;
  popularRatio: number;
}

class AdjustCalibrationUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly tripRepository: TripRepository,
    private readonly calibrationRepo: CalibrationProfileRepository,
  )
}
```

로직: `resolveOwnedTrip` → `CalibrationProfile.fromUserInput(curatedRatio)` → `calibrationRepo.save(tripId, profile)`. (D2 per-trip)

#### `ComposeDayPlanService` (수정)

현재: `recommender.recommendForShortlist(context)` → `Spot[]`.  
변경 후: `RecommendationResult` 수신 → `curatedPicks` 우선 사용, 부족 시 `popularSpots` 보충.

```typescript
// ComposeDayPlanService 내부 변경 지점
const result = await recommender.recommendForShortlist(context);
// curatedPicks 먼저 gap-fill candidates로 사용
const candidates = [
  ...result.curatedPicks.spots,
  ...result.popularSpots.spots.filter(s => !result.curatedPicks.spots.find(c => c.id === s.id)),
];
```

---

## 7. API 엔드포인트

### 7.1 큐레이터 Admin 엔드포인트

모든 admin 엔드포인트: `/api/v1/admin/...` 프리픽스 (A2 — RBAC prefix match).  
`Authorization: Bearer dev-curator` (개발). 라우터: `app.use('/api/v1/admin', requireCuratorRole)` 한 줄로 보호.  
`DevAuthProvider`에 `role: 'curator'` 처리 추가 필요.

```
POST   /api/v1/admin/curation/discover
  body: { region?: Region, category?: string, limit?: number }
  → 202 Accepted { discovered: number, skippedDuplicates: number }

GET    /api/v1/admin/curation/candidates
  query: status=pending|approved|rejected, limit=20, offset=0
  → 200 { candidates: CandidateOutput[], total: number }

POST   /api/v1/admin/curation/candidates/:id/enrich
  → 200 { summary: string, tags: string[], lat: number, lng: number, thumbnailUrl: string, priceRange: string|null }

POST   /api/v1/admin/curation/candidates/:id/approve
  body: { curationScore: number, curationComment?: string }
  → 201 { spotId: string }
  → 422 ApproveError('NotEnriched' | 'IncompleteEnrichment') if enrichment missing (CM-2)

POST   /api/v1/admin/curation/candidates/:id/reject
  → 200 { status: 'rejected' }
  (A1 소프트 삭제 — DELETE 메서드 사용 안 함, status='rejected' 업데이트)
```

### 7.2 Calibration 엔드포인트

```
PATCH  /api/v1/trips/:tripId/calibration
  body: { curatedRatio: number }   // 0.0 ~ 1.0
  → 200 { curatedRatio: number, popularRatio: number }
```

### 7.3 Recommendations 엔드포인트 (변경)

```
GET    /api/v1/trips/:tripId/recommendations
  query: limit=8   (D5: 섹션당 상한 — curatedPicks max 8 + popularSpots max 8. offset 없음)
  → 200 {
      curatedPicks: { label: 'curatedPicks', spots: SpotOutput[], coldStart: boolean },
      popularSpots:  { label: 'popularSpots',  spots: SpotOutput[], coldStart: boolean },
      calibration: { curatedRatio: number, popularRatio: number }
    }
```

### 7.4 Route 파일 구조

```
src/interface/api/routes/
  admin-curation.ts    ← 신규 (registerAdminCurationRoutes)
  calibration.ts       ← 신규 (registerCalibrationRoutes)
  recommendations.ts   ← 수정 (응답 구조 변경)
  trips.ts             ← 무변경
  shortlist.ts         ← 무변경
  dayplan.ts           ← 무변경
  _shared.ts           ← 무변경
```

### 7.5 AppDependencies 확장

```typescript
// src/interface/api/AppDependencies.ts
interface AppDependencies {
  // 기존
  createTripUseCase: CreateTripUseCase;
  getRecommendationsUseCase: GetRecommendationsUseCase;
  updateShortlistUseCase: UpdateShortlistUseCase;
  composeDayPlanUseCase: ComposeDayPlanUseCase;
  editDayPlanUseCase: EditDayPlanUseCase;
  // 신규
  discoverCandidatesUseCase: DiscoverCandidatesUseCase;
  enrichCandidateUseCase: EnrichCandidateUseCase;
  approveCandidateUseCase: ApproveCandidateUseCase;
  rejectCandidateUseCase: RejectCandidateUseCase;
  adjustCalibrationUseCase: AdjustCalibrationUseCase;
}
```

---

## 8. 배치 잡

### 8.1 진입점

```
scripts/sync-spot-scores.ts
```

```typescript
// 단독 실행 가능 (tsx scripts/sync-spot-scores.ts)
// cron 등록: KST 03:00 = UTC 18:00 전날
// 예: `0 18 * * * tsx /app/scripts/sync-spot-scores.ts`
```

### 8.2 실패 처리

- `TrendSource.consecutive_failures >= 3` → stdout `[ALERT]` 로그
- 마지막 성공 데이터 유지 (UPDATE 없이 row 보존)
- 배치 실패 알림 메커니즘 (Slack, PagerDuty): v2 Plan

### 8.3 env 추가 필요

```
DATALAB_API_KEY=<prod value / mock for dev>
IJTO_API_KEY=<prod value / mock for dev>
DISCOVER_THRESHOLD=60
POPULARITY_WEIGHTS=1:1:1
SATURATION_THRESHOLD=85
```

---

## 9. 테스트 전략

### 9.1 도메인 단위 테스트

| 테스트 대상 | 검증 항목 | 파일 |
|---|---|---|
| `CalibrationProfile` | `default()` = 0.5:0.5; `fromUserInput(0.8)` = isUserAdjusted true; `fromUserInput(-0.1)` throws; `fromUserInput(1.1)` throws (D3: withNegativeIntent 제거) | `src/domain/recommender/CalibrationProfile.test.ts` |
| `PopularityScoreCalculator` | z-score 계산 순수함수; 가중치 1:1:1; empty set → 0; partial failure(공공데이터 null) → kakao fallback | `src/domain/curation/PopularityScoreCalculator.test.ts` |
| `RecommendationResult` | curatedPicks ∩ popularSpots = ∅ (중복 없음); curated 우선 중복 제거 | `src/domain/recommender/RecommendationResult.test.ts` |
| `CurationCandidate` | status 전이 (pending→approved/rejected); rejected 후 approve 불가 | `src/domain/curation/CurationCandidate.test.ts` |

### 9.2 Application 단위 테스트

| 테스트 대상 | 검증 항목 | 의존성 mock |
|---|---|---|
| `DiscoverCandidatesUseCase` | 중복 kakaoPlaceId skip (배치 체크); threshold 미만 filter; 신규만 save; 일부 source 실패 시 성공분만 처리 (P1, CM-1) | TrendDiscoveryPort stub, SpotRepo stub, CandidateRepo stub |
| `EnrichCandidateUseCase` | Kakao API 성공 → lat/lng/thumbnail 저장; Kakao API 실패 → EnrichmentError; LLM 성공 → summary/tags/priceRange 저장; 부분 성공 처리 (CM-2) | CandidateRepo stub, LLMEnricher stub, KakaoLocalApi stub |
| `ApproveCandidateUseCase` | pending→spot 생성; enrichedAt null → ApproveError('NotEnriched'); 위치데이터 누락 → ApproveError('IncompleteEnrichment'); idempotent (kakaoPlaceId 충돌 → 기존 spotId); pending 아닌 상태 → error (CM-2) | CandidateRepo stub, SpotRepo stub |
| `RejectCandidateUseCase` | pending→rejected (소프트 삭제); approved→rejected + Spot 비활성화 (트랜잭션); already-rejected → idempotent; not found → NotFoundError (T1, A1) | CandidateRepo stub, SpotRepo stub |
| `SyncSpotScoresUseCase` | 부분 소스 실패 시 성공 소스만 반영; consecutive_failures 3 → ALERT log; dry run; fetchSignalsForSpots 호출 검증 (CM-1) | TrendDataSourcePort stubs, SpotRepo stub, TrendSourceRepo stub |
| `AdjustCalibrationUseCase` | 0.8 입력 → isUserAdjusted=true; 범위 0~1 벗어나면 validation error; trip not owned → auth error; findByTripId 호출 검증 (D2) | CalibrationRepo stub, TripRepo stub |

### 9.3 Integration 테스트

```
src/infrastructure/persistence/repositories.integration.test.ts (기존 파일 확장)
```

추가 테스트:
- `CurationCandidateRepository`: save, findByStatus('rejected') 소프트 삭제 후 조회, existsByKakaoPlaceId, findExistingKakaoPlaceIds (배치), findByStatus('pending')
- `CalibrationProfileRepository`: findByTripId (row 없음 → default), upsert on trip_id (D2 per-trip)
- `PostgresRecommenderAdapter` 두 트랙: curatedPicks ORDER BY curation_score DESC, popularSpots ORDER BY score

### 9.4 E2E 테스트 (신규 파일)

```
tests/e2e/curation.test.ts  — Phase B~D 완료 후 작성
```

**E6 — 발굴 → enrichment → 승인 → 추천 노출:**
1. `POST /api/v1/admin/curation/discover` (stub TrendDiscoveryPort) → N candidates 생성
2. `GET /api/v1/admin/curation/candidates?status=pending` → N개 반환
3. `POST /api/v1/admin/curation/candidates/:id/enrich` → lat/lng/thumbnail/summary 채움
4. `POST /api/v1/admin/curation/candidates/:id/approve` → spot 생성
5. `GET /api/v1/trips/:tripId/recommendations` → curatedPicks에 해당 spot 노출

**E6b — enrichment 없이 승인 거부:**
1. discover → pending candidate
2. `POST /approve` (enrichedAt null) → 422 ApproveError('NotEnriched')

**E6c — 소프트 거절 + status 확인:**
1. discover → pending candidate
2. `POST /reject` → 200 { status: 'rejected' }
3. `GET /candidates?status=rejected` → 해당 candidate 포함 확인

**E7 — Tagalong 두 트랙 + CalibrationProfile:**
1. `POST /trips` (자연어 "유명한 데 말고")
2. `GET /trips/:tripId/recommendations` → curatedPicks + popularSpots 두 섹션
3. `PATCH /trips/:tripId/calibration { curatedRatio: 0.8 }`
4. `GET /trips/:tripId/recommendations` → curatedPicks 비율 80% 반영

### 9.5 기존 E2E 테스트 픽스처 업데이트

`tests/e2e/tagalong.test.ts` — Phase D 후:
- `GET /api/v1/trips/:tripId/recommendations` 응답 구조 검증 추가 (두 섹션)
- `spots.json` fixture에 `trendScore: 0` 필드 추가 (migration 009 후)

---

## 10. 비용·성능 예산

| 항목 | 추정 |
|---|---|
| LLM enrichment (Haiku) | candidate 당 ~$0.01, 100개 시드 = ~$1 |
| 일 배치 외부 API 호출 | datalab 1회, IJTO 1회, kakao N spots 회 (spot 수 × 1 call) |
| 추천 응답 P95 | `Promise.all` 두 트랙 병렬 → DB 2 queries, 목표 < 200ms |
| 전체 SLA | 5초 (core-flow ADR Q6 기준) — 두 트랙 병렬로 영향 없음 |
| 배치 실패 시 | 마지막 성공 데이터 제공 → Stale < 24h, SLA 영향 없음 |

---

## 11. 구현 순서 (Phase)

### Phase A — Spot score 완성 (trend_score 추가)

**목표:** `Spot.trendScore` 필드 추가, DB 준비

작업:
1. `migrations/009_up_spot_trend_score.sql` / `009_down_spot_trend_score.sql` 작성
2. `src/domain/spot/Spot.ts` — `trendScore: number` 필드 추가
3. `src/infrastructure/persistence/PostgresSpotRepository.ts` — SELECT, INSERT에 `trend_score` 반영
4. `tests/fixtures/spots.json` — 15개 fixture에 `trendScore: 0` 추가
5. `SpotRepository` 포트에 `updateScores` 메서드 추가

완료 조건: 기존 183 unit + 5 E2E 테스트 전체 통과. typecheck 0 errors.

---

### Phase B — CurationCandidate 도입

**목표:** 발굴 → 승인 → Spot 활성화 흐름

작업:
1. `migrations/010_up_curation_candidates.sql` 작성
2. `src/domain/curation/CurationCandidate.ts` 엔티티
3. `src/domain/ports/CurationCandidateRepository.ts` 포트
4. `src/infrastructure/persistence/PostgresCurationCandidateRepository.ts` 어댑터
5. `src/application/ports/LLMEnricherPort.ts`
6. `src/application/ports/KakaoLocalApiPort.ts` (CM-2 신규)
7. `src/infrastructure/llm/AnthropicLLMEnricherAdapter.ts`
8. `src/infrastructure/kakao/KakaoLocalPlaceAdapter.ts` (KakaoLocalApiPort 구현, CM-2)
9. `src/domain/ports/TrendDiscoveryPort.ts` (CM-1 신규)
10. `src/infrastructure/trend/DatalabVisitkoreaAdapter.ts` (TrendDiscoveryPort 구현, mock mode)
11. `src/infrastructure/trend/JejuTourismBigdataAdapter.ts` (TrendDiscoveryPort 구현, mock mode)
12. `src/application/curation/DiscoverCandidatesUseCase.ts` (TrendDiscoveryPort 사용, CM-1)
13. `src/application/curation/EnrichCandidateUseCase.ts` (KakaoLocalApiPort 포함, CM-2)
14. `src/application/curation/ApproveCandidateUseCase.ts` (enrichment guard, CM-2)
15. `src/application/curation/RejectCandidateUseCase.ts` (소프트 삭제, SpotRepo 의존성, A1/T1)
16. `src/interface/api/routes/admin-curation.ts` (A2: /admin prefix, A1: POST /reject)
17. `AppDependencies` 확장, `src/index.ts` wiring

완료 조건: 신규 use case 단위 테스트 통과. integration test (candidate CRUD + soft-delete) 통과. curl로 discover→enrich→approve 흐름 수동 확인.

---

### Phase C — TrendSource + 배치 동기화

**목표:** 일 배치 점수 동기화 파이프라인

작업:
1. `migrations/012_up_trend_sources.sql`
2. `src/domain/ports/TrendDataSourcePort.ts` (CM-1: `fetchSignalsForSpots(spotIds)` 시그니처)
3. `src/infrastructure/trend/DatalabVisitkoreaAdapter.ts` — TrendDataSourcePort + TrendDiscoveryPort 모두 구현 (CM-1)
4. `src/infrastructure/trend/JejuTourismBigdataAdapter.ts` — TrendDataSourcePort + TrendDiscoveryPort 모두 구현 (CM-1)
5. `src/infrastructure/trend/KakaoMapRatingAdapter.ts` (TrendDataSourcePort만, fallback)
6. `src/domain/curation/PopularityScoreCalculator.ts`
7. `src/domain/ports/TrendSourceRepository.ts` (배치 상태 추적)
8. `src/infrastructure/persistence/PostgresTrendSourceRepository.ts`
9. `src/application/curation/SyncSpotScoresUseCase.ts`
10. `scripts/sync-spot-scores.ts` 진입점

완료 조건: `SyncSpotScoresUseCase` 단위 테스트 통과 (stub 어댑터 사용). dry run 실행 성공.

---

### Phase D — Recommender 두 트랙 + Calibration (Breaking Change)

**목표:** 두 섹션 응답 구조, CalibrationProfile

주의: 이 Phase는 `Recommender` 인터페이스, `GetRecommendationsUseCase`, `ComposeDayPlanService`를 동시 변경. 단일 커밋.

작업:
1. `migrations/011_up_calibration_profiles.sql`
2. `src/domain/recommender/CalibrationProfile.ts` VO
3. `src/domain/recommender/RecommendationSection.ts` VO
4. `src/domain/recommender/RecommendationResult.ts` VO
5. `src/domain/recommender/Recommender.ts` — 반환형 변경
6. `src/domain/recommender/RecommendationContext.ts` — `calibration` 필드 추가
7. `src/domain/ports/CalibrationProfileRepository.ts`
8. `src/infrastructure/persistence/PostgresCalibrationProfileRepository.ts`
9. `src/infrastructure/recommender/PostgresRecommenderAdapter.ts` — 두 트랙 병렬 구현
10. `src/application/core-flow/GetRecommendationsUseCase.ts` — v2 출력 구조
11. `src/application/core-flow/ComposeDayPlanService.ts` — `RecommendationResult` 처리
12. `src/application/curation/AdjustCalibrationUseCase.ts`
13. `src/interface/api/routes/calibration.ts`
14. `src/interface/api/routes/recommendations.ts` — 응답 구조 변경
15. `AppDependencies` + `src/index.ts` wiring
16. `tests/e2e/tagalong.test.ts` — recommendations 응답 구조 assertion 추가
17. `tests/fixtures/spots.json` — 이미 Phase A에서 업데이트됨

완료 조건: 전체 테스트 통과 (기존 + 신규). typecheck 0 errors. E7 E2E 통과.

---

### Phase E — 시드 워크플로우 1회 실행

**목표:** 초기 50~100개 Spot 큐레이션 (OQ-CUR-3 3-Phase)

작업 (코드 X, 운영):
1. Phase 0: `POST /api/v1/admin/curation/discover?region=all&limit=100` → TrendDiscoveryPort → datalab TOP100 candidate 생성
2. Phase 1: 각 candidate에 `POST /api/v1/admin/curation/candidates/:id/enrich` 실행 (Kakao + LLM, 비용 ~$1)
3. Phase 2: 큐레이터가 candidate 목록 검토 → `POST /:id/approve` (curationScore 입력) or `POST /:id/reject`

완료 조건: `GET /admin/curation/candidates?status=approved` 50개 이상.

---

## 12. 위험·완화

| 위험 | 영향 | 완화 |
|---|---|---|
| Breaking change (GET /recommendations) | E2E 5개 테스트 + 클라이언트 | Phase D에서 E2E 동시 업데이트. 클라이언트 없는 Option A 단계라 영향 최소 |
| Recommender 인터페이스 변경 | ComposeDayPlanService 컴파일 오류 | Phase D 단일 커밋으로 전체 동시 교체. typecheck이 안전망 |
| 공공 데이터 API 스키마 변화 | 어댑터 정규화 오류 | 어댑터 단위 테스트에 raw fixture 포함. 스키마 불일치 → fast fail |
| LLM 비용 폭주 | 수동 trigger + per-call cost log | `EnrichCandidateUseCase` 단건 호출만. 배치 enrichment는 명시적 loop |
| PostgresRecommenderAdapter cold-start | `findTopByCurationScore` 경로 | Phase A~C 동안 Recommender 인터페이스 변경 없음. Phase D에서만 변경 |
| 큐레이터 1인 병목 | 승인 적체 | silver label (LLM 자동) + golden label (사람 승인) 분리로 발굴은 논블로킹 |
| trend_score DEFAULT 0 | popularSpots 초기 랭킹 무의미 | Phase C 배치 1회 실행 후 의미 있는 점수. 초기엔 popularity_score로 정렬 |

---

## 13. Open Questions (Build에서 결정)

이 Plan에서 모든 OQ를 닫음. 잔여 없음.

| OQ | 결정 | Build 주의 |
|---|---|---|
| OQ-CUR-1 | z-score 합산, 가중치 1:1:1, config 외부화 | `POPULARITY_WEIGHTS` env 파싱 로직 |
| OQ-CUR-2 | 수동 trigger only, cron 없음 | `/discover` endpoint만 구현 |
| OQ-CUR-3 | 3-phase 시드, 200은 목표 아님 | Phase E 운영 절차 |
| OQ-CUR-4 | 일 배치 KST 03:00, 실시간 Now Mode 제외 | `scripts/sync-spot-scores.ts` + cron 가이드 |

---

## 14. 파일 변경 요약

### 신규 파일

```
migrations/
  009_up_spot_trend_score.sql
  009_down_spot_trend_score.sql
  010_up_curation_candidates.sql
  010_down_curation_candidates.sql
  011_up_calibration_profiles.sql
  011_down_calibration_profiles.sql
  012_up_trend_sources.sql
  012_down_trend_sources.sql

src/domain/curation/
  CurationCandidate.ts
  PopularityScoreCalculator.ts

src/domain/recommender/
  CalibrationProfile.ts
  RecommendationSection.ts
  RecommendationResult.ts

src/domain/ports/
  CurationCandidateRepository.ts
  CalibrationProfileRepository.ts        (D2: per-trip)
  TrendDataSourcePort.ts                 (CM-1: fetchSignalsForSpots)
  TrendDiscoveryPort.ts                  (CM-1 신규: fetchCandidatesByRegion)
  TrendSourceRepository.ts

src/application/ports/
  LLMEnricherPort.ts
  KakaoLocalApiPort.ts                   (CM-2 신규)

src/application/curation/
  DiscoverCandidatesUseCase.ts
  EnrichCandidateUseCase.ts
  ApproveCandidateUseCase.ts
  RejectCandidateUseCase.ts
  SyncSpotScoresUseCase.ts
  AdjustCalibrationUseCase.ts

src/infrastructure/trend/
  DatalabVisitkoreaAdapter.ts            (CM-1: TrendDataSourcePort + TrendDiscoveryPort 구현)
  JejuTourismBigdataAdapter.ts           (CM-1: TrendDataSourcePort + TrendDiscoveryPort 구현)
  KakaoMapRatingAdapter.ts               (TrendDataSourcePort만, score-sync fallback)

src/infrastructure/llm/
  AnthropicLLMEnricherAdapter.ts

src/infrastructure/kakao/
  KakaoLocalPlaceAdapter.ts              (CM-2: KakaoLocalApiPort 구현)

src/infrastructure/persistence/
  PostgresCurationCandidateRepository.ts
  PostgresCalibrationProfileRepository.ts (D2: trip_id PK)
  PostgresTrendSourceRepository.ts

src/interface/api/routes/
  admin-curation.ts                      (A2: /admin prefix, A1: POST /reject)
  calibration.ts

scripts/
  sync-spot-scores.ts

tests/e2e/
  curation.test.ts
```

### 수정 파일

```
src/domain/spot/Spot.ts                           (+trendScore)
src/domain/recommender/Recommender.ts             (반환형 변경 — Phase D)
src/domain/recommender/RecommendationContext.ts   (+calibration — Phase D)
src/domain/ports/SpotRepository.ts                (+updateScores, +existsByKakaoPlaceId, +findExistingKakaoPlaceIds, +deactivate)
src/infrastructure/persistence/PostgresSpotRepository.ts  (+trend_score, +updateScores, +existsByKakaoPlaceId, +findExistingKakaoPlaceIds, +deactivate)
src/infrastructure/recommender/PostgresRecommenderAdapter.ts  (두 트랙 — Phase D)
src/application/core-flow/GetRecommendationsUseCase.ts        (v2 출력 — Phase D)
src/application/core-flow/ComposeDayPlanService.ts            (RecommendationResult — Phase D)
src/interface/api/routes/recommendations.ts                   (응답 구조 — Phase D)
src/interface/api/AppDependencies.ts                          (+신규 use cases)
src/index.ts                                                  (wiring 확장)
tests/fixtures/spots.json                                     (+trendScore: 0)
tests/e2e/tagalong.test.ts                                    (+recommendations assertions)
.env.example                                                  (+신규 env vars)
```

---

## Implementation Tasks

Synthesized from this review's findings. Run with Claude Code; checkbox as you ship.

- [ ] **T1 (P1, human: ~20min / CC: ~5min)** — RejectCandidateUseCase — Soft-delete reject + approved→rejected cascade with Spot deactivation
  - Surfaced by: A1 (soft delete) + T1 (approved→rejected policy)
  - Files: `src/application/curation/RejectCandidateUseCase.ts`, `src/domain/ports/SpotRepository.ts` (+deactivate)
  - Verify: unit tests — pending→rejected, approved→rejected+spot.isActive=false, already-rejected idempotent, not-found error

- [ ] **T2 (P1, human: ~1h / CC: ~15min)** — TrendDiscoveryPort — Introduce `TrendDiscoveryPort` + `TrendCandidate` VO separate from `TrendDataSourcePort`
  - Surfaced by: CM-1 (TrendSignal.spotId incompatible with new-place discovery)
  - Files: `src/domain/ports/TrendDiscoveryPort.ts` (신규), `src/domain/ports/TrendDataSourcePort.ts` (fetchSignalsForSpots), Datalab + IJTO adapters 두 인터페이스 구현
  - Verify: `DiscoverCandidatesUseCase` unit test에서 TrendDiscoveryPort stub 사용 확인

- [ ] **T3 (P1, human: ~45min / CC: ~10min)** — EnrichCandidateUseCase — `KakaoLocalApiPort` 추가로 lat/lng/thumbnailUrl 수집
  - Surfaced by: CM-2 (ApproveCandidateUseCase가 Spot 생성 시 위치 데이터 없음)
  - Files: `src/application/ports/KakaoLocalApiPort.ts` (신규), `src/infrastructure/kakao/KakaoLocalPlaceAdapter.ts` (신규), `src/application/curation/EnrichCandidateUseCase.ts`
  - Verify: Kakao API 성공/실패/부분성공 unit test; ApproveCandidateUseCase enrichedAt guard

- [ ] **T4 (P1, human: ~20min / CC: ~5min)** — CalibrationProfileRepository — `calibration_profiles` PK를 `traveller_id` → `trip_id`로 변경
  - Surfaced by: D2 (per-trip 결정)
  - Files: `migrations/011_up_calibration_profiles.sql`, `src/domain/ports/CalibrationProfileRepository.ts`, `src/infrastructure/persistence/PostgresCalibrationProfileRepository.ts`, `src/application/curation/AdjustCalibrationUseCase.ts`
  - Verify: integration test — findByTripId(unknown) → default(), upsert on trip_id

- [ ] **T5 (P2, human: ~20min / CC: ~5min)** — DiscoverCandidatesUseCase — N×2 DB 호출을 배치 체크 2회로 줄임
  - Surfaced by: P1 (N+1 패턴)
  - Files: `src/domain/ports/SpotRepository.ts` (+findExistingKakaoPlaceIds), `src/domain/ports/CurationCandidateRepository.ts` (+findExistingKakaoPlaceIds), `src/application/curation/DiscoverCandidatesUseCase.ts`
  - Verify: 100개 신호 입력 → DB call count = 2 (not 200)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | CM-1, CM-2 포함 20건 발견, 9건 반영 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 9 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** TrendSignal.spotId discovery 불호환(CM-1), Spot 생성 시 위치 데이터 누락(CM-2) 등 20건 → 9건 플랜 반영
- **CROSS-MODEL:** CM-1/CM-2는 Claude 리뷰에서 놓쳤고 Codex가 잡음 — 두 모델 합의로 신뢰도 높음
- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — 9건 결정 완료, 5개 구현 태스크 문서화. 구현 시작 가능.
