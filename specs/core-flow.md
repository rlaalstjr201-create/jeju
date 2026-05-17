# Light Spec — Core Flow

**Feature:** Shortlist 구성 → ScheduleComposer → DayPlan 초안
**Persona:** Tagalong — 가족여행에 끌려가는 30대
**Status:** Draft

---

## 사용자 시나리오

> 민준(32)은 다음 주 가족 제주 여행에 끌려가게 됐다. 아내가 항공권은 끊었다. 일정은 아직 없다.
> 앱을 열고 한 줄 입력한다: "3박4일 제주 가요"
> Spot 카드가 올라온다. 마음에 드는 것만 찜한다.
> "일정 만들어줘" 탭 → DayPlan 초안이 생긴다.
> 민준은 Day 2에서 카드 하나를 빼고, 대신 혼자 가고 싶은 오름을 추가한다.
> 완료.

---

## 입력 / 출력

### 입력

| 항목 | 형태 | 필수 | 비고 |
|------|------|------|------|
| 여행 기간 | 자연어 또는 날짜 선택 | Y | "3박4일" → Trip 생성 시 date range 확정. 파싱 실패 시 기본값: 다음 주말 1박2일 (KST); 결과 화면 상단에 추정값 표시 + 한 탭 수정 (D2, B5) |
| Kakao 로그인 | 소셜 인증 | Y | Traveller 식별; Guest 없음 |
| Shortlist 선택 | Spot 카드 탭 | Y | 최소 1개 이상이어야 ScheduleComposer 호출 가능 |

최초 화면에서 자연어 한 줄 이외 추가 입력 없음 — ChatGPT 진입 비용 이하.

### 출력

| 항목 | 형태 |
|------|------|
| Spot 카드 목록 | 이름, 카테고리, 지역, curationScore 기반 정렬 |
| Shortlist | 선택한 Spot의 staged 목록 |
| DayPlan 초안 | Day별 Spot 순서 (지역 클러스터링, 시간 없음) |

---

## 도메인 호출 순서

```
1. Traveller 인증 (Kakao)
   └─ Traveller 생성 또는 조회

2. Trip 생성
   └─ trip = Trip(traveller, dateRange)
   └─ TripPhase = planning

3. 추천 요청
   └─ context = RecommendationContext(traveller, trip)
   └─ spots = Recommender.recommendForShortlist(context)
      ├─ Shortlist 비어있음 → curationScore 기반 cold-start 랭킹
      └─ Shortlist 있음 → SpotPreferences 파생 후 weighted 랭킹

4. Shortlist 구성
   └─ traveller.shortlist.add(spot) (반복)

5. DayPlan 구성 요청
   └─ dayPlan = ScheduleComposer.compose(shortlist, trip)
      ├─ Shortlist ≥ 1개면 호출 가능 (최소 제한; D1)
      ├─ Spot 수 < Day 수 → Recommender.recommendForShortlist(context) 로 빈 Day 보충
      │   └─ 보충된 Spot은 Shortlist에도 추가됨 (invariant)
      │   └─ UI: 보충 Spot에 "자동 추천으로 채움" 레이블 표시 (B1, B5)
      └─ 초안 반환 (auto-apply 없음)

6. DayPlan 편집 (선택)
   └─ day.pin(spot) / day.unpin(spot)
   └─ Traveller가 권위자 — 앱이 덮어쓰지 않음 (B5)
```

---

## Out of scope

- **Booking / deepLink 실행** — Trip 생성과 DayPlan 편집만; 예약 화면은 별도 feature
- **Now Mode** — GPS 트리거 즉흥 추천은 v2
- **Trip 날짜 변경 후 Day 재조정** — 별도 feature (shortening policy 포함)
- **Spot 검색** — 카드 탐색으로만 진입; 키워드 검색은 별도 feature
- **ScheduleComposer 재호출 (fill/replace 분기)** — DayPlan에 manual pin 없는 초기 상태에서만 다루므로 분기 발생 안 함; 재호출 시나리오는 별도 feature
- **TripPhase 전환 트리거** — planning 고정; active/completed 전환 별도 feature
- **복수 Trip** — 단일 Trip 흐름만

---

## Mission Checklist

검증 기준 (B5 > A5 > A1 > A4 우선순위).

| ID | 기준 | 상태 | 근거 |
|----|------|------|------|
| B5 | Non-destructive | ✅ | ScheduleComposer 초안만 반환; 자동 채움 Spot 레이블로 투명 공개; 날짜 기본값 수정 가능 |
| B1 | Trustworthy | ✅ | 자동 추천 Spot에 "자동 추천으로 채움" 레이블 (hallucination 방지 아님, 출처 투명성) |
| B2 | Lightweight | ⏳ | OQ-2 미결 (카드 수 결정 후 확인) |
| B3 | Immediate | ⏳ | Recommender 응답 지연 미측정 — Plan 단계에서 다룸 |
| A1 | Comfortable | ⏳ | UX 설계 미완; 카드 UI + DayPlan 편집 흐름 Plan 단계에서 확인 |
| A5 | Monetisation-agnostic | ✅ | 이 flow에 affiliate/ad 로직 없음 |

## Open questions

| # | 질문 | 영향 범위 |
|---|------|----------|
| OQ-1 | 자연어 "3박4일" 파싱을 어디서 처리하나? 인프라(NLP/regex)인가, UI Date picker로 대체하나? | 입력 UX |
| OQ-2 | Recommender cold-start 랭킹에서 Spot 몇 개를 반환하나? 카드 수가 많으면 선택 피로 발생 (B2) | Recommender 출력 |
| OQ-4 | Spot 카드에 Kakao 사진 위젯을 인라인으로 넣나, 탭 후 상세에서만 보여주나? | 인프라(KakaoMapAdapter) + 초기 로딩 |
