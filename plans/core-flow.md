# Implementation Plan — Core Flow

**Based on:** `specs/core-flow.md` + `docs/context.md`
**Feature:** Shortlist 구성 → ScheduleComposer → DayPlan 초안
**Status:** Ready for plan-reviewer

---

## 0. context.md 일관성 선언

이 계획의 모든 도메인 용어는 `docs/context.md` 기준. 발견된 모순 없음.
- Trip.dateRange: required, non-nullable (D2) ✅
- ScheduleComposer: 최소 1 Spot, gap-fill → Shortlist 잔류 (D1) ✅
- Shortlist: Traveller 소유, Trip 독립 ✅
- Day: dayIndex 기반, 시간 없음, pin/unpin API ✅
- Spot: 사진 미저장, Kakao Places 위젯으로 런타임 서빙 ✅

---

## 1. 잔류 Open Questions 결정

### OQ-1 — 자연어 파싱 위치

**결정: Regex pre-filter + LLM structured output 폴백**

| 경로 | 트리거 | 지연 | 처리 |
|------|--------|------|------|
| Regex | `\d박\d일` 패턴 (e.g. "3박4일") | < 5ms | 직접 추출 |
| LLM | 그 외 ("이번 주말", "5월 말에") | ~600ms | structured output: `{ startDate, nights }` |
| Fallback | LLM도 실패 | 0ms | D2 기본값 (다음 주말 1박2일) |

Tagalong 입력 패턴 대부분이 `N박N일` 형태이므로 regex path가 ~60% 이상을 커버. LLM은 infrastructure 레이어 `ParseFreeTextAdapter` — 도메인에 노출 안 됨. Port: `ParseFreeTextPort.parse(text) → { startDate: CalendarDate, nights: number } | null`.

**Mission 영향:**
- B3 (Immediate) ✅ — regex path 거의 즉각, LLM path < 1초 (auth verify와 병렬)
- A2 (Smart) ✅ — "이번 주말" 등 맥락 이해 가능
- B1 (Trustworthy) ✅ — LLM 실패 시 추정값 UI 노출 (D2), 블랙박스 없음

---

### OQ-2 — cold-start 카드 반환 개수

**결정: 초기 12장, 스크롤 시 +8 페이지네이션**

근거:
- 12 = 3×4 그리드 (표준 모바일 카드 패턴), 한 화면에 스캔 가능
- 4박5일 기준 2 Spot/day × 5 = 10 — 12는 여유 있는 선택지
- 20장 이상 → 선택 피로 (B2 위반)
- 스크롤 페이지네이션으로 더 탐색하고 싶은 Traveller 수용

API: `GET /recommendations?limit=12&offset=0`

**Mission 영향:**
- B2 (Lightweight) ✅ — 12장은 결정 부담 최소
- A1 (Comfortable) ✅ — 한 화면 완결, 스크롤 없이 선택 시작 가능

---

### OQ-4 — Spot 카드 사진 인라인 vs 상세

**결정: Kakao Local API 썸네일 인라인, Kakao Places 위젯은 상세 뷰에서만**

context.md: "Photos are not stored — served at runtime via Kakao Maps Places widget embed." → 카드 당 위젯 embed는 12회 동시 iframe 생성 — 초기 로딩 불가.

대신: Kakao Local API 응답에 포함된 정적 썸네일 URL을 카드에 인라인. 위젯 embed는 사용자가 카드 탭 → 상세 진입 시 단 1회 로드.

**Mission 영향:**
- B3 (Immediate) ✅ — 썸네일 병렬 fetch; 위젯 지연 없음
- A1 (Comfortable) ✅ — 시각적 스캔 가능 (ChatGPT 텍스트 벽 차별화)
- A4 (Partner-like) ✅ — 사진 있는 카드 = 친구가 보내준 추천 링크 느낌

---

## 2. 아키텍처 매핑

### 스택

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 언어 | TypeScript | 도메인 타입 안전성; Kakao SDK JS 지원 |
| API 서버 | Fastify | 낮은 오버헤드, async-first |
| DB | PostgreSQL 16 + pgvector | 관계형 + 벡터 검색 단일 인스턴스 |
| LLM | Claude API (structured output) | `ParseFreeTextAdapter`만 사용 |
| 인증 | Kakao OAuth2 | context.md: 소셜 로그인 필수 |

### 폴더 구조 (DDD 레이어)

```
src/
├── domain/
│   ├── traveller/
│   │   └── Traveller.ts
│   ├── trip/
│   │   ├── Trip.ts                 ← dateRange required invariant
│   │   ├── DayPlan.ts
│   │   └── Day.ts                  ← pin / unpin / pinnedSpots
│   ├── spot/
│   │   └── Spot.ts                 ← curationScore, popularityScore, region
│   ├── shortlist/
│   │   └── Shortlist.ts            ← Traveller-owned, Trip-independent
│   ├── recommender/
│   │   ├── Recommender.ts          ← domain service interface (Port)
│   │   ├── RecommendationContext.ts
│   │   └── SpotPreferences.ts      ← derived from Shortlist, non-persisted
│   ├── schedule-composer/
│   │   └── ScheduleComposer.ts     ← compose(shortlist, trip) → DayPlan
│   └── shared/
│       ├── CalendarDate.ts         ← YYYY-MM-DD, KST-fixed
│       ├── Region.ts               ← enum: jeju-city | eastern | seogwipo | western | hallasan
│       └── PriceRange.ts           ← enum: free | budget | mid | premium
│
├── application/
│   └── core-flow/
│       ├── CreateTripUseCase.ts           ← steps 1-2
│       ├── GetRecommendationsUseCase.ts   ← step 3
│       ├── UpdateShortlistUseCase.ts      ← step 4
│       ├── ComposeDayPlanUseCase.ts       ← step 5
│       └── EditDayPlanUseCase.ts          ← step 6
│
├── infrastructure/
│   ├── persistence/
│   │   ├── PostgresTripRepository.ts       ← travellers + trips
│   │   ├── PostgresSpotRepository.ts
│   │   ├── PostgresShortlistRepository.ts
│   │   └── PostgresDayPlanRepository.ts    ← day_plans + days + pinned_spots (D5)
│   ├── kakao/
│   │   ├── KakaoAuthAdapter.ts             ← ACL: verifyToken → TravellerId
│   │   └── KakaoLocalAdapter.ts            ← ACL: Spot 썸네일 URL 조회
│   ├── llm/
│   │   └── LLMParseFreeTextAdapter.ts      ← ParseFreeTextPort 구현
│   └── recommender/
│       └── PostgresRecommenderAdapter.ts   ← RecommenderPort 구현 (카테고리 가중 쿼리; D3)
│
└── interface/
    └── api/
        ├── trips.ts
        ├── recommendations.ts
        ├── shortlist.ts
        └── dayplan.ts
```

### 도메인 호출 순서 → 코드 레이어 매핑

| Step | 도메인 | Application | Infrastructure |
|------|--------|-------------|----------------|
| 1. 인증 | Traveller 생성/조회 | CreateTripUseCase | KakaoAuthAdapter → PostgresTripRepository |
| 2. Trip 생성 | Trip(traveller, dateRange) | CreateTripUseCase | LLMParseFreeTextAdapter, PostgresTripRepository |
| 3. 추천 | Recommender.recommendForShortlist | GetRecommendationsUseCase | PgVectorRecommenderAdapter |
| 4. Shortlist | shortlist.add(spot) | UpdateShortlistUseCase | PostgresShortlistRepository |
| 5. Compose | ScheduleComposer.compose | ComposeDayPlanUseCase | PostgresRecommenderAdapter (gap-fill), PostgresDayPlanRepository (저장) |
| 6. 편집 | day.pin / day.unpin | EditDayPlanUseCase | PostgresDayPlanRepository |

### Port / Adapter 분리

```
ParseFreeTextPort       ←→  LLMParseFreeTextAdapter      (Claude API)
AuthPort                ←→  KakaoAuthAdapter             (Kakao OAuth2)
SpotThumbnailPort       ←→  KakaoLocalAdapter            (Kakao Local API)
SpotRepository          ←→  PostgresSpotRepository       (PostgreSQL)
TripRepository          ←→  PostgresTripRepository       (PostgreSQL; travellers + trips)
ShortlistRepository     ←→  PostgresShortlistRepository  (PostgreSQL)
DayPlanRepository       ←→  PostgresDayPlanRepository    (PostgreSQL; day_plans + days + pinned_spots — D5)
RecommenderPort         ←→  PostgresRecommenderAdapter   (PostgreSQL; 카테고리 가중 쿼리 — D3)
```

도메인 레이어는 Port 인터페이스만 알고, Adapter 구현은 infrastructure에만 존재.

---

## 3. API 계약

### 엔드포인트

#### POST /api/v1/trips
자연어 입력 → Trip 생성

```
Request:
  Authorization: Bearer <kakao_token>
  Body: { freeText: string }

Response 201:
  { tripId: string, startDate: string, endDate: string, dateInferred: boolean }

Response 400:
  { code: "INVALID_DATE_RANGE", message: string }
Response 401:
  { code: "UNAUTHORIZED" }
```

`dateInferred: true`이면 클라이언트가 상단 배너로 추정값 + 수정 CTA 표시 (D2, B5).

---

#### GET /api/v1/trips/:tripId/recommendations
cold-start 또는 SpotPreferences 기반 Spot 카드 목록

```
Request:
  Authorization: Bearer <kakao_token>
  Query: { limit?: number (default 12), offset?: number (default 0) }

Response 200:
  {
    spots: Array<{
      spotId: string,
      name: string,
      category: string,
      region: Region,
      priceRange: PriceRange,
      curationScore: number,
      thumbnailUrl: string,      ← Kakao Local API 정적 URL
      curationComment: string    ← 1-2줄 한국어 에디터 코멘트
    }>,
    total: number,
    coldStart: boolean           ← Shortlist 비어 있었으면 true
  }

Response 404: { code: "TRIP_NOT_FOUND" }
Response 403: { code: "FORBIDDEN" }
```

---

#### PATCH /api/v1/shortlist
Spot 추가 / 제거

```
Request:
  Authorization: Bearer <kakao_token>
  Body: { spotId: string, action: "add" | "remove" }

Response 200:
  { shortlistCount: number }

Response 404: { code: "SPOT_NOT_FOUND" }
```

---

#### POST /api/v1/trips/:tripId/dayplan
ScheduleComposer 호출 → DayPlan 초안

```
Request:
  Authorization: Bearer <kakao_token>

Response 201:
  {
    dayPlanId: string,
    days: Array<{
      dayIndex: number,
      date: string,
      spots: Array<{
        spotId: string,
        name: string,
        region: Region,
        position: number,
        isAutoFilled: boolean   ← D1: "자동 추천으로 채움" 레이블 소스
      }>
    }>,
    autoFilledSpotIds: string[]  ← gap-fill로 추가된 Spot ID 목록
  }

Response 400:
  { code: "SHORTLIST_EMPTY" }   ← Shortlist < 1 Spot
Response 404:
  { code: "TRIP_NOT_FOUND" }
```

---

#### PATCH /api/v1/trips/:tripId/dayplan/days/:dayIndex/spots
Day 편집 (pin / unpin)

```
Request:
  Authorization: Bearer <kakao_token>
  Body: { spotId: string, action: "pin" | "unpin", position?: number }

Response 200:
  {
    dayIndex: number,
    spots: Array<{ spotId: string, name: string, position: number, isAutoFilled: boolean }>
  }

Response 404: { code: "SPOT_NOT_FOUND" | "DAY_NOT_FOUND" }
```

### 공통 에러 형태

```json
{
  "code": "ERROR_CODE",
  "message": "사용자 노출용 메시지 (한국어)",
  "details": {}
}
```

---

## 4. 데이터 모델

### 테이블 스키마

```sql
-- travellers
travellers (
  id         UUID  PK
  kakao_id   TEXT  UNIQUE NOT NULL
  created_at TIMESTAMPTZ NOT NULL
)

-- trips
trips (
  id            UUID  PK
  traveller_id  UUID  FK → travellers
  start_date    DATE  NOT NULL       -- KST, YYYY-MM-DD (CalendarDate)
  end_date      DATE  NOT NULL
  phase         TEXT  NOT NULL DEFAULT 'planning'
                      CHECK IN ('planning','active','completed')
  date_inferred BOOLEAN NOT NULL DEFAULT false  -- D2: 추정값 여부
  created_at    TIMESTAMPTZ NOT NULL
  CONSTRAINT valid_range CHECK (end_date >= start_date)
)

-- spots (editorial DB; seeded, not user-generated)
spots (
  id               UUID   PK
  kakao_place_id   TEXT   UNIQUE NOT NULL
  name             TEXT   NOT NULL
  region           TEXT   NOT NULL CHECK IN ('jeju-city','eastern','seogwipo','western','hallasan')
  category         TEXT   NOT NULL
  price_range      TEXT   NOT NULL CHECK IN ('free','budget','mid','premium')
  curation_score   SMALLINT NOT NULL
  popularity_score SMALLINT NOT NULL
  curation_comment TEXT               -- 1-2줄 한국어
  lat              FLOAT8 NOT NULL
  lng              FLOAT8 NOT NULL
  thumbnail_url    TEXT               -- Kakao Local API 정적 URL (캐시)
  embedding        VECTOR(1536)       -- pgvector: SpotPreferences 매칭용
  is_active        BOOLEAN NOT NULL DEFAULT true
  updated_at       TIMESTAMPTZ NOT NULL
)

-- shortlist_spots (Traveller-owned, Trip-independent)
shortlist_spots (
  traveller_id  UUID     FK → travellers
  spot_id       UUID     FK → spots
  is_auto_filled BOOLEAN NOT NULL DEFAULT false  -- D1: gap-fill로 추가됐는지
  added_at      TIMESTAMPTZ NOT NULL
  PRIMARY KEY (traveller_id, spot_id)
)

-- day_plans (Trip과 1:1)
day_plans (
  id         UUID PK
  trip_id    UUID UNIQUE FK → trips
  created_at TIMESTAMPTZ NOT NULL
)

-- days (day_index 기반; CalendarDate는 Trip 날짜 변동 시 갱신)
days (
  id          UUID     PK
  day_plan_id UUID     FK → day_plans
  day_index   SMALLINT NOT NULL   -- 1-based
  date        DATE     NOT NULL   -- KST CalendarDate
  UNIQUE (day_plan_id, day_index)
)

-- pinned_spots
pinned_spots (
  day_id        UUID     FK → days
  spot_id       UUID     FK → spots
  position      SMALLINT NOT NULL
  is_auto_filled BOOLEAN NOT NULL DEFAULT false  -- UI 레이블 소스 (D1)
  PRIMARY KEY (day_id, spot_id)
)
```

### pgvector 사용 위치

| 목적 | 컬럼 | 쿼리 |
|------|------|------|
| SpotPreferences 기반 추천 | — | `WHERE category = ANY($categories) ORDER BY curation_score * $weight DESC` (카테고리 분포 가중치; D3) |
| cold-start (Shortlist 없음) | — | `ORDER BY curation_score DESC` |
| 유사 Spot / semantic 검색 | `spots.embedding` | `ORDER BY embedding <=> $query_vector` (v1 기본 추천 흐름 미사용; 인프라 준비; D4) |

`SpotPreferences`는 Shortlist Spot의 카테고리 분포 맵으로 즉석 파생 (non-persisted). 예: `{ oreum: 0.4, cafe: 0.3, beach: 0.3 }`. Recommender가 이 분포를 가중치로 변환해 카테고리 필터+정렬 쿼리 실행 (D3). `spots.embedding`은 SpotPreferences 연산에 관여하지 않는다 (D4).

---

## 5. 테스트 전략

### 도메인 단위 테스트 (외부 의존 없음)

| 대상 | 케이스 |
|------|--------|
| `Trip` | 유효 dateRange 생성; start > end 거부; dayCount 계산 정확성 |
| `Day.pin` | pinnedSpots 추가; 동일 Spot 중복 pin → 멱등; position 순서 유지 |
| `Day.unpin` | pinnedSpots 제거; 없는 Spot unpin → 무시 (no throw) |
| `Shortlist.add` | Spot 추가; 동일 Spot 중복 → 멱등 |
| `ScheduleComposer` | Shortlist 0개 → 거부; Spot 수 = Day 수 → Recommender 미호출; Spot 수 < Day 수 → Recommender 호출; gap-fill Spot → Shortlist 추가 확인; Region 클러스터링 — 같은 Region Spot은 같은 Day에 |
| `SpotPreferences` | Shortlist 타입 분포 계산; 빈 Shortlist → cold-start 표시 |

### E2E Tagalong 시나리오 (5개)

| # | 입력 | 기대 결과 |
|---|------|----------|
| E1 | "3박4일 제주 가요" + 8 Spot 선택 | 4일 DayPlan, Region별 클러스터, autoFilledSpotIds 없음 |
| E2 | "제주 가요" (기간 없음) | dateInferred=true; 기본값 1박2일 DayPlan; 배너 노출 |
| E3 | 1 Spot (seogwipo 카페) + 3박4일 | Recommender gap-fill 3회; 4 Days 완성; 3 Spot이 shortlist에 isAutoFilled=true로 추가됨 |
| E4 | Spot 수 = Day 수 (4 Spot, 3박4일) | Recommender 미호출; DayPlan 초안 즉시 반환 |
| E5 | DayPlan 생성 후 Day1 Spot unpin → Shortlist에서 다른 Spot pin | Day1 변경 반영; Shortlist 잔류 확인; ScheduleComposer 재호출 안 함 |

### Gap-fill 시나리오 상세 (E3)

```
Given:
  Traveller with 1 Spot (seogwipo, restaurant)
  Trip: 3박4일 (dayCount = 4)

When:
  ScheduleComposer.compose(shortlist, trip)

Then:
  Recommender.recommendForShortlist called once
  Returns ≥ 3 Spots from remaining Days' regions
  All 3 returned Spots added to Shortlist with isAutoFilled=true
  DayPlan has 4 Days, each with ≥ 1 pinned Spot
  API response includes autoFilledSpotIds with 3 IDs
  UI receives isAutoFilled=true flags for those Spots
```

---

## 6. 응답 SLA 전략 (B3 — 5초 목표)

### 크리티컬 패스 분석

```
T=0ms     사용자 입력 제출
           ├─ [parallel A] Kakao auth verify ─────── ~200ms
           └─ [parallel B] ParseFreeText ──────────── ~5ms (regex) / ~600ms (LLM)

T=200ms   Trip create (DB write) ─────────────────── ~30ms

T=230ms   Recommender cold-start query ────────────── ~150ms
           (pgvector on ~200 Spots: 거의 instantaneous)

T=380ms   첫 12 카드 화면 렌더링  ✅ (< 1초)
           ↕ (사용자 카드 탐색 — 5초~수분)

T+x       Shortlist → ScheduleComposer ────────────── ~100ms
T+x+100ms DayPlan 초안 반환  ✅
```

**입력 → 첫 카드**: Regex path ~400ms / LLM path ~850ms — 둘 다 5초 이내.
**입력 → DayPlan 초안**: 사용자 행동(카드 선택) 포함 시 측정 불가; 기계적 지연만 합산 시 ~650ms.

### 완화 전략

| 병목 | 전략 |
|------|------|
| LLM parse 지연 | Regex pre-filter로 ~60% 케이스 skip |
| Auth + parse 순차 실행 | 두 작업 병렬 실행 (Promise.all) |
| cold-start 쿼리 | `curation_score DESC` 정렬은 인덱스 커버; pgvector 불필요 |
| 카드 썸네일 로딩 | Kakao Local API 정적 URL → CDN 캐시 가능 |
| ScheduleComposer gap-fill | Recommender 재호출 1회로 제한; 배치 반환 |

---

## 7. 구현 순서

### Sub-agent 단위

| Agent | 범위 | 외부 의존 |
|-------|------|----------|
| **A** | Domain models + unit tests (Trip, Day, DayPlan, Spot, Shortlist, Traveller, value objects, ScheduleComposer 로직) | 없음 |
| **B** | DB schema migrations (PostgreSQL + pgvector extension) | 없음 |
| **C** | KakaoAuthAdapter (OAuth2 토큰 검증 → TravellerId) | Kakao API |
| **D** | LLMParseFreeTextAdapter (regex pre-filter + Claude structured output) | Claude API |
| **E** | PostgresSpotRepository + Spot seed pipeline: (1) Kakao Local API 200 Spots 수집, (2) Voyage AI voyage-3 (1536 dim)로 embedding 배치 생성 → `spots.embedding` 저장 (D4; SpotPreferences와 무관 — 인프라 준비) | Kakao Local API, Voyage AI API, DB |
| **F** | PgVectorRecommenderAdapter (cold-start + SpotPreferences-weighted 쿼리) | DB (pgvector) |
| **G** | ScheduleComposer 구현 (Region 클러스터링 알고리즘, gap-fill 오케스트레이션) | Agent A (domain), Agent F (Recommender) |
| **H** | Application use cases + Fastify API 엔드포인트 5개 | Agents A, B, C, D, F, G |
| **I** | E2E 테스트 스위트 (5 Tagalong 시나리오 + gap-fill 상세) | Agent H (API 실행 중) |

### 의존성 그래프

```
A ──────────────────────────────── G
A ──────────────────────────────── F
B ─── E
B ─── F
B ─── H
C ─── H
D ─── H
E ─── F
F ─── G
G ─── H
H ─── I
```

A와 B는 독립 — B(schema)는 Agent A의 코드 출력이 아닌 plans/core-flow.md §4 스펙을 소비한다 (D6-ㄴ).

### 병렬 배치

```
Batch 1 (병렬):  A  B  C  D   ← 모두 독립 (D6-ㄴ)
                 ↓  ↓
Batch 2:         E (B 완료 후)
                 ↓
Batch 3 (병렬):  F  G  (A, B, E 완료 후)
                 ↓
Batch 4:         H (C, D, F, G 완료 후)
                 ↓
Batch 5:         I (H 완료 후)
```

최소 경로: A → F → G → H → I (직렬 5단계). B, C, D는 A와 병렬로 선행.

---

## Mission Checklist (최종)

| ID | 기준 | 상태 | 근거 |
|----|------|------|------|
| B5 | Non-destructive | ✅ | ScheduleComposer 초안 반환; isAutoFilled 플래그로 투명 공개; dateInferred 배너 |
| A5 | Monetisation-agnostic | ✅ | 이 계획 어디에도 affiliate/ad 로직 없음 |
| A1 | Comfortable | ✅ | 한 줄 입력; 12장 카드; 사진 인라인 (OQ-4); DayPlan 편집 단순 pin/unpin |
| B1 | Trustworthy | ✅ | isAutoFilled 레이블; dateInferred 배너; LLM 실패 → 명시적 기본값 |
| B2 | Lightweight | ✅ | 12장 초기 (OQ-2); 추가 질문 없음 (D2); Shortlist 1개로 Compose 가능 (D1) |
| B3 | Immediate | ✅ | Regex path < 400ms; LLM path < 900ms; 병렬 실행 (섹션 6) |
| A2 | Smart | ✅ | LLM 자연어 파싱; SpotPreferences 기반 weighted 추천 |
| B4 | Honest | ✅ | curationComment 에디터 코멘트 노출; popularityScore 숨기지 않음 |
| B6 | Familiar | ✅ | Kakao 로그인; "찜하기" UI 레이블 |
| A4 | Partner-like | ⏳ | curationComment 문체 · 카드 UX 디자인 단계에서 확인 |
| A3 | Genuinely useful | ✅ | DayPlan 초안 → 실제 제주 일정 산출물 |

---

---

## Plan Review

**Reviewed by:** plan-eng-review (gstack) — non-interactive mode (Windows/spawned)
**Date:** 2026-05-17
**Input files:** `docs/context.md`, `specs/core-flow.md`, `plans/core-flow.md`

---

### ✅ 통과 항목

| # | 검토 관점 | 결과 |
|---|----------|------|
| 1a | context.md 도메인 용어 (Trip, Day, Spot, Shortlist, DayPlan, Traveller, CalendarDate, Region, priceRange, TripPhase) | 모두 정의 준수 |
| 1b | Deprecated 용어 (Schedule, ScheduleRewriter, TasteProfile) | 계획 어디에도 없음 |
| 2 | 6단계 도메인 호출 → 레이어 매핑 | Step 1-6 전부 Application/Infrastructure에 1:1 매핑 |
| 3 | OQ-1/2/4 결정 → Mission Criteria 추적 | OQ-1 → B3·A2, OQ-2 → B2·A1, OQ-4 → B3·A1·A4 모두 위반 없음 |
| 6 | gap-fill 시나리오 + Tagalong 5케이스 | E1–E5 + Given/When/Then gap-fill 상세 모두 포함 |
| 7a | Kakao ACL | KakaoAuthAdapter + KakaoLocalAdapter — 파트너 브랜드 도메인 미노출 |
| 7b | LLM Port/Adapter 분리 | ParseFreeTextPort ↔ LLMParseFreeTextAdapter ✅ |
| 7c | DB Port/Adapter 분리 | SpotRepository, TripRepository, ShortlistRepository ↔ Postgres 구현 ✅ |

---

### ✅ 해소된 항목 (Rev 2)

| ID | 결정 | 해소 방법 |
|----|------|----------|
| BLOCKER B1 | SpotPreferences = 카테고리 분포 맵 | D3 채택 (Option B); context.md + plan 모두 갱신 |
| MAJOR B2 | DayPlanRepository Port 추가 | D5; Port/Adapter 목록 + 레이어 매핑 + 폴더 구조 갱신 |
| MAJOR B3 | A↔B 독립 확인 | D6-ㄴ; `A ─── B` 화살표 제거 |
| MAJOR B4 | embedding = 유사 Spot 인프라 (v1 미사용) | D4; Agent E에 Voyage AI 배치 잡 추가 |

---

### ❌ 수정 필요 항목 (Rev 1 원문 보존)

---

#### [BLOCKER — ✅ RESOLVED via D3] B1 — SpotPreferences 구현 정의가 context.md와 충돌

**위치:** `plans/core-flow.md` § 4. 데이터 모델 > pgvector 사용 위치, line 386

**증거:**
- `context.md`: SpotPreferences = *"the distribution of Spot types it contains"* (카테고리 타입 분포)
- `plans/core-flow.md`: `"SpotPreferences는 Shortlist Spot들의 embedding 평균 벡터로 파생"`

두 정의는 다른 것이다. 타입 분포(categorical histogram)는 embedding 벡터(dense float array)가 아니다. 계획이 도메인 계약을 암묵적으로 업그레이드했다.

이 충돌이 blockers인 이유가 세 가지다:

1. domain/recommender/SpotPreferences.ts를 어떻게 구현할지 Agent A와 Agent F가 다르게 해석한다. Agent A는 타입 분포 계산기를 만들고 Agent F는 벡터 평균 계산기를 만들면 두 코드가 충돌한다.
2. embedding 방식은 Spot seeding 시점에 embedding 생성 파이프라인을 필요로 한다 (아래 Major B3 참고). 이 의존성이 Agent E 범위에 들어가야 하는데 현재 없다.
3. CLAUDE.md 절대 룰: `context.md 없이 도메인 entity·용어 추정 금지.`

**필요한 조치 (둘 중 하나):**

- **Option A**: context.md의 SpotPreferences 정의를 embedding 방식으로 업데이트. Grilling/patch를 거쳐 도메인 권위 변경. 이후 Agent E에 embedding 생성 파이프라인 추가.
- **Option B**: 계획의 pgvector 사용 위치를 context.md 정의에 맞춤 — SpotPreferences = 타입 분포로 구현, vector 검색은 별도 mechanism으로 분리. (단, 이 경우 `ORDER BY embedding <=> $preference_vector` 쿼리 방식 변경 필요)

**Build 진입 금지 — 이 항목이 해소될 때까지.**

---

#### [MAJOR — ✅ RESOLVED via D5] B2 — DayPlanRepository / DayRepository가 Port/Adapter 목록에서 누락

**위치:** `plans/core-flow.md` § 2. 아키텍처 매핑 > Port/Adapter 분리 + § 7. Sub-agent 단위

**증거:**

- 데이터 모델에 `day_plans`, `days`, `pinned_spots` 세 테이블이 있다.
- `ComposeDayPlanUseCase` (step 5)는 DayPlan 초안을 DB에 저장해야 한다.
- `EditDayPlanUseCase` (step 6)는 `day.pin / day.unpin` 결과를 저장해야 한다.
- 레이어 매핑 표 step 6: "PostgresTripRepository"가 담당으로 명시됐지만 PostgresTripRepository는 trips 테이블 담당이다. pinned_spots 저장은 다른 Repository 책임이다.
- Port/Adapter 목록에 `DayPlanRepository ↔ PostgresDayPlanRepository`가 없다.

결과: Agent H가 ComposeDayPlanUseCase를 구현할 때 어떤 Repository에 DayPlan을 저장해야 하는지 알 수 없다. Agent G(ScheduleComposer)도 마찬가지다.

**권장 변경:**
- `DayPlanRepository` Port 추가 (`saveDayPlan`, `findByTrip`, `updatePinnedSpots`)
- `PostgresDayPlanRepository` Adapter 추가 (day_plans + days + pinned_spots 테이블 담당)
- 레이어 매핑 표 step 5, 6의 Infrastructure 컬럼을 `PostgresDayPlanRepository`로 수정

---

#### [MAJOR — ✅ RESOLVED via D6-ㄴ] B3 — 의존성 그래프와 Batch 1 스케줄이 모순

**위치:** `plans/core-flow.md` § 7. 구현 순서 > 의존성 그래프 + 병렬 배치

**증거:**
- 그래프: `A ─── B` → A가 B보다 먼저 완료돼야 함
- Batch 1: `A B C D` 병렬 실행

`A ─── B` (schema mirrors domain)는 논리적으로 맞다. DB schema는 도메인 타입을 미러링하므로, domain models(A)가 확정되지 않으면 schema(B)에서 컬럼/타입이 틀릴 수 있다. 특히 ScheduleComposer 내부 데이터 흐름이 A에서 확정된다.

두 선택지:
- **Option A**: 그래프가 정확 → B를 Batch 2로 이동. `Batch 1: A C D` / `Batch 2: B E (A 완료 후)`. 직렬 경로 1단계 증가.
- **Option B**: Batch 1이 의도 → 그래프에서 `A ─── B` 화살표 제거하고 이유 명시 ("schema spec은 plan 문서에서 충분히 확정됐으므로 A와 병렬 가능").

**권장:** Option A. 이 프로젝트는 속도보다 정확성 우선. A 완료 후 B 착수해도 전체 배치 수는 동일(5배치).

---

#### [MAJOR — ✅ RESOLVED via D4] B4 — Spot embedding 생성 파이프라인 미정의

**위치:** `plans/core-flow.md` § 7. Sub-agent E + § 4. pgvector 사용 위치

**증거:**
- `spots.embedding VECTOR(1536)` 컬럼이 있고 Recommender가 이를 사용한다.
- Agent E 범위: "Kakao Local API 200 Spots 수집 스크립트" — Kakao Local API는 텍스트 데이터를 주지 embedding을 주지 않는다.
- 어떤 모델로 embedding을 생성하는지 (Claude API text embedding? OpenAI ada-002? local model?) 미정.
- 이는 Blocker B1과 연결된다 — SpotPreferences를 embedding 방식으로 확정할 경우, embedding 생성이 Agent E의 핵심 작업이 된다.

**권장 변경:**
- Blocker B1 Option A 채택 시: Agent E에 "Spot 텍스트(이름+카테고리+코멘트) → embedding 생성 → DB 저장" 단계 추가. 사용 모델 결정 필요.
- Blocker B1 Option B 채택 시: `spots.embedding` 컬럼 불필요, 제거. Agent E 단순화.

---

### ⚠️ Minor 항목

#### [minor] M1 — TravellerRepository 미정의

`KakaoAuthAdapter.verifyToken → TravellerId`를 반환하지만, CreateTripUseCase에서 TravellerId로 Traveller entity를 findOrCreate해야 한다. `PostgresTripRepository`가 이 역할을 맡는지 독립 `TravellerRepository`가 있는지 명시가 없다.

**권장:** Port/Adapter 목록에 `TravellerRepository` 추가 (단순 findOrCreate 인터페이스면 충분; PostgresTripRepository 파일 내부에 구현 병합 가능).

---

#### [minor] M2 — SLA 분석에 썸네일 이미지 로딩 비용 미모델링

T=380ms를 "첫 12 카드 화면 렌더링"으로 표기하지만, 이는 API 응답 시점이다. 12개 `thumbnailUrl` 이미지 로딩(모바일 기준 ~300-1500ms)이 포함되지 않았다. 썸네일을 진행형 로딩(skeleton UI → lazy load) 방식으로 처리하면 체감 렌더는 API 응답 직후로 당길 수 있다. 이 전략을 명시하면 B3 달성 근거가 더 견고해진다.

---

#### [minor] M3 — ParseFreeText 실패 경로 Domain 단위 테스트 누락

E2(E2E)가 dateInferred 경로를 커버하지만, `ParseFreeTextPort.parse()` 반환값이 `null`일 때 CreateTripUseCase가 D2 기본값을 사용하는 경로에 대한 unit test가 없다. Application layer 단위 테스트 케이스 하나 추가 필요.

---

#### [minor] M4 — Kakao OAuth2 토큰 만료 처리 미정

Kakao access token TTL은 ~2시간이다. Bearer 토큰 만료 시 API가 401을 반환하지만 클라이언트 refresh 전략이 미정이다. 이 feature 범위 밖이라면 Out of scope에 명시적으로 추가해야 한다. 현재 Out of scope 목록에 없다.

---

### 종합 판정

```
🚫 BUILD ENTRY BLOCKED  [Rev 1 — 2026-05-17]
  BLOCKER 1 + MAJOR 3 존재. 상세 위 참조.

✅ BUILD READY  [Rev 2 — 2026-05-17]
  BLOCKER B1 → RESOLVED (D3)
  MAJOR B2   → RESOLVED (D5)
  MAJOR B3   → RESOLVED (D6-ㄴ)
  MAJOR B4   → RESOLVED (D4)

잔여 위험 (Minor — Build 진입 후 처리 허용):
  M1  TravellerRepository 인터페이스 명시 미완 — Agent A/H 착수 시 해소
  M2  SLA 분석에 썸네일 로딩 비용 미포함 — 구현 후 실측으로 보완
  M3  ParseFreeText 실패 경로 단위 테스트 미작성 — Agent D 착수 시 추가
  M4  Kakao OAuth2 토큰 만료 처리 Out-of-scope 미명시 — specs 업데이트 권장

BUILD READY. Agent A 착수 가능.
```
