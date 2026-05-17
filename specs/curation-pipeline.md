# Light Spec — Curation Pipeline

**Feature:** 큐레이션 파이프라인 + 두 트랙 추천 응답  
**Persona:** 큐레이터(서비스 운영자) + Tagalong (30대, 가족여행)  
**Status:** Draft  
**Depends on:** ADR-0017 (two-track recommendation), ADR-0018 (TrendSource ACL), D-CUR-1~6

---

## 사용자 시나리오

### 시나리오 A — 큐레이터: 신규 Spot 발굴 및 승인

> 운영자(큐레이터)는 주 1회 발굴 파이프라인을 실행한다.  
> 시스템이 TrendSource(IJTO, visitkorea, Kakao)에서 트렌드 신호를 받아 Spot 후보를 자동 생성한다.  
> LLM이 각 후보에 카테고리 태그·한국어 요약을 붙인다 ("silver label").  
> 큐레이터는 관리 화면에서 후보 목록을 검토한다. 마음에 드는 Spot에 `curationScore`와 `curationComment`를 입력하고 "승인"한다 ("golden label").  
> 승인된 후보는 즉시 활성 `Spot`으로 전환돼 Traveller에게 노출된다.  
> 관심 없는 후보는 "거절"로 아카이브된다.

### 시나리오 B — Tagalong: 자연어 입력 → 두 섹션 추천

> 수진(34)은 "이번 주말 제주 1박2일 자연 좋아하고 유명한 데 말고"라고 입력한다.  
> 시스템이 "유명한 데 말고"를 negative meta-intent로 파싱 → `CalibrationProfile.curatedRatio` 상향 조정.  
> 추천 응답이 두 섹션으로 반환된다:
> - **큐레이터 픽** (curatedPicks): 수진이 잘 모를 것 같은 오름, 숨겨진 카페
> - **인기 장소** (popularSpots): 혼잡도 낮은 날 가기 좋은 TOP 명소  
> 수진은 두 섹션을 스크롤하면서 찜한다.  
> 필요시 슬라이더로 비율을 직접 조정한다 (B5, A4).

---

## 입력 / 출력

### 큐레이션 파이프라인 API

| 엔드포인트 | 메서드 | 역할 |
|---|---|---|
| `/api/v1/curation/candidates/discover` | POST | 자동 발굴 트리거 (cron 또는 관리자 수동). body: `{ sources?: string[] }` |
| `/api/v1/curation/candidates` | GET | 큐레이터용 후보 목록. query: `status=pending\|approved\|rejected`, `limit`, `offset` |
| `/api/v1/curation/candidates/:id/approve` | POST | 승인 + 점수 부여. body: `{ curationScore: number, curationComment?: string }` |
| `/api/v1/curation/candidates/:id/reject` | POST | 거절 + 아카이브 |

### 추천 응답 구조 변경

**기존 (v1):**
```
GET /api/v1/trips/:tripId/recommendations
→ { spots: Spot[], total: number, coldStart: boolean }
```

**변경 후 (curation-pipeline):**
```
GET /api/v1/trips/:tripId/recommendations
→ {
    curatedPicks: {
      label: 'curatedPicks',
      spots: Spot[],
      coldStart: boolean
    },
    popularSpots: {
      label: 'popularSpots',
      spots: Spot[],
      coldStart: boolean
    },
    calibration: { curatedRatio: number, popularRatio: number }
  }
```

> ⚠️ Breaking change from v1 response. 기존 `spots[]` flat 구조 제거. 마이그레이션 가이드 Plan에서 작성.

### CalibrationProfile 조정 API

| 엔드포인트 | 메서드 | 역할 |
|---|---|---|
| `/api/v1/trips/:tripId/calibration` | PATCH | 사용자가 슬라이더로 비율 직접 입력. body: `{ curatedRatio: number }` (0.0–1.0). `popularRatio = 1 - curatedRatio` |

---

## 도메인 호출 순서

### 발굴 흐름 (CurationCandidate 생성)

```
POST /curation/candidates/discover
  └─ TrendSourcePort (각 ACL 어댑터)       ← IJTOAdapter, VisitKoreaAdapter, KakaoMapRatingAdapter
       └─ TrendSignal[] (normalised)
            └─ CandidateDiscoverer           ← 기존 Spot과 중복 제거, 임계치 이상만 선별
                 └─ LLM enrichment           ← 카테고리 태깅, 한국어 요약 생성 (silver label)
                      └─ CurationCandidate (status: pending) → DB 저장
```

### 승인 흐름 (Spot 활성화)

```
POST /curation/candidates/:id/approve
  └─ CurationCandidate (pending → approved)
       └─ Spot 생성 (curationScore, curationComment 포함, is_active = true)
            └─ DB 저장 → 즉시 Recommender에 노출
```

### 추천 흐름 (두 트랙)

```
GET /trips/:tripId/recommendations
  └─ resolveOwnedTrip(authService, tripRepo, token, tripId)
       └─ ShortlistRepository.findByTravellerId
            └─ SpotPreferences.fromShortlist          ← 카테고리 분포
                 └─ CalibrationProfile 추출
                 │    ├─ 자연어 파싱 결과에서 negative meta-intent 반영
                 │    └─ PATCH /calibration 사용자 명시 값 (있으면 우선)
                 └─ Recommender.recommendForShortlist(context)
                      ├─ curatedPicks: curationScore DESC, SpotPreferences 카테고리 필터
                      └─ popularSpots: (popularityScore + trendScore) weighted, 혼잡도 saturation down-rank
                           └─ RecommendationResult { curatedPicks, popularSpots }
```

### ScheduleComposer — 두 트랙 gap-fill

```
POST /trips/:tripId/dayplan
  └─ shortlist.count < trip.dayCount 시:
       └─ Recommender.recommendForShortlist → RecommendationResult
            └─ ComposeDayPlanService: curatedPicks 우선 사용, 부족 시 popularSpots에서 보충
                 └─ 자동 채움된 Spot: is_auto_filled = true (ADR-0014 sticky)
```

---

## Out of scope (이 Spec에서)

- 외부 API rate limit 정책 및 retry 전략 → Plan
- TrendSignal 캐싱 전략 (일배치 vs 실시간) → Plan (OQ-CUR-4)
- `popularityScore` 정규화 공식 (카드매출 단위 vs 혼잡도 지수 정규화) → Plan (OQ-CUR-1)
- CandidateDiscoverer 임계치 산정 → Plan
- 큐레이터 관리 화면 UI 디자인 → 별도 (관리자 앱)
- 다중 큐레이터, 역할 기반 접근 제어 → v2
- LLM 발굴 빈도 스케줄 → Plan (OQ-CUR-2)
- 후속 마이그레이션 (`003_up_spots.sql` 후속: `trendScore` 컬럼 추가, `spot_trend_signals` 테이블) → Plan

---

## Open Questions (Plan 전 결정 필요)

| ID | 질문 | 영향 |
|---|---|---|
| OQ-CUR-1 | `popularityScore` 정규화 공식: 카드매출 TOP15·혼잡도·리뷰수를 어떻게 단일 0–100 스케일로 합산? 단순 min-max? 가중 평균? | popularSpots 트랙 랭킹 정확도 |
| OQ-CUR-2 | LLM 발굴 빈도: 일배치·주배치·수동 트리거? | 운영 부담, API 비용, `CurationCandidate` 적체량 |
| OQ-CUR-3 | 초기 200개 큐레이션 시작점: 큐레이터 머릿속 후보 직접 입력 vs 카테고리 빈칸 채우기 목표제 vs 인플루언서 시드? | 론칭 Spot 품질·다양성 |
| OQ-CUR-4 | 공공 데이터 fetch 주기: 실시간 (요청마다 ACL 호출) vs 일배치 (materialised `spot_scores` 테이블)? | 레이턴시, 인프라 복잡도, 데이터 신선도 |

---

## Mission Checklist 사전 점검

| ID | Criterion | 판정 | 근거 |
|----|-----------|------|------|
| A1 | Comfortable | ✅ | 두 섹션은 스크롤로 분리 열람; 슬라이더는 선택적 |
| A2 | Smart | ✅ | "유명한 데 말고" → CalibrationProfile 동적 조정; 입력 한 줄 |
| A3 | Genuinely useful | ✅ | curatedPicks = 큐레이터 판단; popularSpots = 사회적 검증. 둘 다 실질적 가치 |
| A4 | Partner-like | ✅ | 슬라이더로 명시 조정 가능; 자동 추론도 함께 제공 |
| A5 | Monetisation-agnostic | ✅ | curationScore는 상업적 파트너십과 독립 (ADR-0010 재확인) |
| B1 | Trustworthy | ✅ | curatedPicks 출처 명시 ("큐레이터 픽"); LLM tag는 silver, 사람 승인이 golden |
| B2 | Lightweight | ⚠️ | 두 섹션 표시 = UI 복잡도 증가. 기본 뷰에서 섹션 라벨을 간결하게 유지해야 함 |
| B3 | Immediate | ⚠️ | TrendSource ACL 호출 레이턴시. OQ-CUR-4 캐싱 전략으로 해결 필요 |
| B4 | Honest | ✅ | 두 트랙 분리 = popularity bias 혼입 방지 (ADR-0017) |
| B5 | Non-destructive | ✅ | CalibrationProfile 슬라이더는 사용자 명시 조정; 자동 추론은 기본값만 |
| B6 | Familiar | ✅ | 두 섹션 패턴 = 카카오맵 "추천순/인기순" UI 친숙도 활용 가능 |

---

## 관련 ADR

- ADR-0017: Two-track recommendation (Algotorial pattern) — 두 트랙 설계 근거
- ADR-0018: External trend data ACL — TrendSource 격리 근거
- ADR-0014: is_auto_filled sticky semantics — gap-fill 시 자동 채움 플래그
- ADR-0010: No monetisation influence — curationScore 상업 독립성 재확인
