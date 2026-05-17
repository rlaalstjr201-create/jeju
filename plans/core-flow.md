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
│   │   ├── PostgresTripRepository.ts
│   │   ├── PostgresSpotRepository.ts
│   │   └── PostgresShortlistRepository.ts
│   ├── kakao/
│   │   ├── KakaoAuthAdapter.ts       ← ACL: verifyToken → TravellerId
│   │   └── KakaoLocalAdapter.ts      ← ACL: Spot 썸네일 URL 조회
│   ├── llm/
│   │   └── LLMParseFreeTextAdapter.ts ← ParseFreeTextPort 구현
│   └── recommender/
│       └── PgVectorRecommenderAdapter.ts ← RecommenderPort 구현
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
| 5. Compose | ScheduleComposer.compose | ComposeDayPlanUseCase | PgVectorRecommenderAdapter (gap-fill) |
| 6. 편집 | day.pin / day.unpin | EditDayPlanUseCase | PostgresTripRepository |

### Port / Adapter 분리

```
ParseFreeTextPort       ←→  LLMParseFreeTextAdapter   (Claude API)
AuthPort                ←→  KakaoAuthAdapter           (Kakao OAuth2)
SpotThumbnailPort       ←→  KakaoLocalAdapter          (Kakao Local API)
SpotRepository          ←→  PostgresSpotRepository     (PostgreSQL)
TripRepository          ←→  PostgresTripRepository     (PostgreSQL)
ShortlistRepository     ←→  PostgresShortlistRepository (PostgreSQL)
RecommenderPort         ←→  PgVectorRecommenderAdapter (pgvector)
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
| SpotPreferences 기반 추천 | `spots.embedding` | `ORDER BY embedding <=> $preference_vector` |
| cold-start (Shortlist 없음) | — | `ORDER BY curation_score DESC` (벡터 불필요) |

`SpotPreferences`는 Shortlist Spot들의 embedding 평균 벡터로 파생 (non-persisted). Recommender가 즉석 계산 후 쿼리.

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
| **E** | PostgresSpotRepository + Spot seed pipeline (Kakao Local API 200 Spots 수집 스크립트) | Kakao Local API, DB |
| **F** | PgVectorRecommenderAdapter (cold-start + SpotPreferences-weighted 쿼리) | DB (pgvector) |
| **G** | ScheduleComposer 구현 (Region 클러스터링 알고리즘, gap-fill 오케스트레이션) | Agent A (domain), Agent F (Recommender) |
| **H** | Application use cases + Fastify API 엔드포인트 5개 | Agents A, B, C, D, F, G |
| **I** | E2E 테스트 스위트 (5 Tagalong 시나리오 + gap-fill 상세) | Agent H (API 실행 중) |

### 의존성 그래프

```
A ──────────────────────────────── G
A ──────────────────────────────── F
A ─── B
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

### 병렬 배치

```
Batch 1 (병렬):  A  B  C  D
                 ↓  ↓
Batch 2:         E (B 완료 후)
                 ↓
Batch 3 (병렬):  F  G  (A, B, E 완료 후)
                 ↓
Batch 4:         H (C, D, F, G 완료 후)
                 ↓
Batch 5:         I (H 완료 후)
```

최소 경로: A → F → G → H → I (직렬 5단계). B, C, D는 Batch 1에서 병렬로 선행.

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

*plan-reviewer 전달 준비 완료. 위 계획에 context.md 모순 없음. Agent I까지 구현 완료 시 core-flow 기능 검증 가능.*
