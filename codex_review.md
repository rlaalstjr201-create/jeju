# Codex Cross-Model Review — Jeju Core Flow

> Reviewer model: o4-mini (OpenAI Codex v0.128.0)
> Review date: 2026-05-17
> Commit reviewed: ddbd50b
> Prompt source: .codex-review-prompt.txt

---

## PASS

- **[Trip dateRange invariant / D2]** `Trip` constructor throws `InvalidDateRangeError` when `end.isBefore(start)`. Invariant lives in domain code, not just tests. ✓
- **[dayCount formula]** `end.diffDays(start) + 1` — inclusive, matches spec. ✓
- **[pin/unpin idempotent]** `Day.pin` guards with `.some()` before push; `Day.unpin` is noop if not found. ✓
- **[Shortlist.add idempotent]** Guards with `.contains()` before push. ✓
- **[ShortlistEmptyError / D1]** `ScheduleComposer.compose` throws at `spots.length === 0`. ✓
- **[SpotPreferences / D3]** Categorical distribution map, not embedding vector. Computed on demand, never persisted. ✓
- **[D4 — embedding not used in v1]** Warm-path query uses category weights, not vector similarity. ✓
- **[D5 — DayPlanRepository port+adapter]** Port and `PostgresDayPlanRepository` both exist. ✓
- **[SQL injection]** All queries parameterized. No string concatenation in SQL. ✓
- **[Shortlist independence invariant]** Pinning a Spot does not touch Shortlist state. ✓
- **[DayPlan save transactional]** `PostgresDayPlanRepository.save` wraps day_plans + days + pinned_spots in a single BEGIN/COMMIT. ✓
- **[Shortlist save transactional]** `PostgresShortlistRepository.save` wraps fetch + DELETE + upsert in a single BEGIN/COMMIT. ✓

---

## FINDINGS

### [MAJOR] Gap-fill writes shortlist and dayplan in separate transactions — partial failure leaves inconsistent state

**Location:** `src/application/core-flow/ComposeDayPlanService.ts` — gap-fill path (STEP 1 / STEP 3)

**Evidence:**
```
// STEP 1: save shortlist (with auto-fill flags)
await params.shortlistRepository.save(params.travellerId, updatedShortlist, autoFilledSpotIds);

// STEP 2: recompose with updated shortlist
const dayPlan = composer.compose(updatedShortlist, params.trip);

// STEP 3: save day plan
await params.dayPlanRepository.save(params.trip.id, dayPlan, autoFilledSpotIds);
```

**Risk:** If `dayPlanRepository.save` fails (DB connection drop, constraint violation, etc.), the shortlist already has auto-filled spots committed. On retry, `ScheduleComposer.compose` will use the now-larger shortlist, potentially producing a different `DayPlan` than the original gap-fill intended. The user's shortlist has spots they never explicitly added, with no associated dayplan.

**Fix direction:** Execute both saves inside a single cross-repository unit of work (shared `PoolClient`/transaction), or introduce a compensating transaction that rolls back the shortlist mutation on dayplan save failure.

---

### [MAJOR] ForbiddenError falls through to 500 in PATCH dayplan route

**Location:** `src/interface/api/routes/dayplan.ts` — `PATCH /api/v1/trips/:tripId/dayplan/days/:dayIndex/spots` error handler

**Evidence:**
```
// error mapping: SpotNotFoundError->404, DayNotFoundError->404, TripNotFoundError->404, other->500
// NOTE: ForbiddenError not caught here
```
`EditDayPlanUseCase` throws `ForbiddenError` when `trip.travellerId !== traveller.id`, but the route does not catch it. Any authenticated traveller passing another traveller's `tripId` receives a 500, leaking that the trip exists and triggering unintended server error logs.

**Fix direction:** Add `ForbiddenError → 403` to the catch block in `dayplan.ts`, identical to how `trips.ts` and `recommendations.ts` handle it.

---

### [MAJOR] EditDayPlanUseCase hardcodes `isAutoFilled: false` — loses DB flag on every edit

**Location:** `src/application/core-flow/EditDayPlanUseCase.ts:176`

**Evidence:**
```typescript
return { dayIndex: input.dayIndex, spots: day.pinnedSpots.map((s, i) => ({
  spotId: s.id, name: s.name, region: s.region, position: i, isAutoFilled: false
})) };
```
`updatePinnedSpots` also writes pinned_spots without an `is_auto_filled` flag. After any pin/unpin, the response always reports all spots as `isAutoFilled: false`, even if those spots were auto-filled during compose.

**Risk:** UI can no longer distinguish auto-filled spots from manually pinned ones after the first edit. The `is_auto_filled` metadata collected during gap-fill becomes invisible. This is a data accuracy bug affecting every user who edits a plan that went through gap-fill.

**Fix direction:** `PostgresDayPlanRepository.findByTripId` should read `is_auto_filled` from `pinned_spots` and expose it through the `Day`/`Spot` model. `EditDayPlanUseCase` should propagate the flag from the loaded domain object rather than hardcoding `false`.

---

### [MINOR] is_auto_filled flag is write-once — user cannot clear it by re-adding a spot

**Location:** `src/infrastructure/persistence/PostgresShortlistRepository.ts` — `save()` logic; `src/application/core-flow/UpdateShortlistUseCase.ts`

**Evidence:**
```
// is_auto_filled logic: existingMap.get(spot.id) ?? autoFilledSpotIds?.includes(spot.id) ?? false
// UpdateShortlistUseCase calls save() WITHOUT autoFilledSpotIds arg
```
When a spot already in the DB has `is_auto_filled=true` and the user manually removes then re-adds it, `UpdateShortlistUseCase` calls `save(travellerId, shortlist)` without `autoFilledSpotIds`. The repository reads the existing flag from `existingMap.get(spot.id)` — which was deleted on remove and recreated on add — but since the spot was deleted and re-inserted, `existingMap` after DELETE won't contain it, so it will resolve to `false` on re-add.

**Correction to the prompt description:** The flag _can_ be cleared on remove+add (because DELETE removes the row from existingMap). However, if the spot was never removed (e.g., user just calls add on an already-present auto-filled spot), `existingMap.get(spot.id)` returns `true` and the flag persists. This is an inconsistency: the flag semantics depend on whether the user removed-and-readded vs. just re-added.

**Fix direction:** Decide explicitly: is `is_auto_filled` meant to be sticky (informational, never cleared) or clearable on explicit user-add? Document the decision and add a test that proves the intended behavior both ways.

---

### [MINOR] Warm recommender returns only categories already in shortlist — may not eliminate empty days

**Location:** `src/infrastructure/recommender/PostgresRecommenderAdapter.ts` — warm path

**Evidence:**
```sql
WHERE is_active=true AND category = ANY($categories) ORDER BY weighted_score DESC LIMIT $limit
```
A shortlist with only `cafe` spots produces only cafe candidates. If all cafes are in the same region, region clustering assigns them to a single day, leaving other days empty even after gap-fill.

**Risk:** Gap-fill does not guarantee all days get at least one spot. The compose step may still return a DayPlan with empty days if region diversity is insufficient.

**Fix direction:** This is a product design gap, not a code bug. The spec does not guarantee all days are filled. Document the limitation. For production, consider a fallback to cold-start for categories outside the shortlist when the warm path yields insufficient regional diversity.

---

### [MINOR] Invalid `action` value silently defaults to `pin` — should return 400

**Location:** `src/interface/api/routes/dayplan.ts` — PATCH handler; `src/interface/api/routes/shortlist.ts` — PATCH handler

**Evidence:**
```
// action defaults to 'pin' if body.action is neither 'pin' nor 'unpin' (NO validation error returned)
```
A typo like `"action": "unPin"` silently pins the spot. API clients get no error feedback. Same issue exists in `shortlist.ts` for the `add`/`remove` action.

**Fix direction:** Validate `action` before calling the use case. Return 400 with a descriptive error if it is not an accepted value.

---

## ANSWERS TO SPECIFIC QUESTIONS

**Q1:** Real data integrity risk. If `dayPlanRepository.save` throws, the shortlist is already mutated with auto-filled spots that have no associated dayplan. On retry, the shortlist is now larger, producing a potentially different DayPlan. The shortlist also permanently contains spots the user did not add. **Severity: MAJOR** — requires cross-repository transaction or saga.

**Q2:** Yes. Hardcoding `false` is wrong. Spots that were auto-filled during compose should remain tagged as auto-filled in the edit response. The flag needs to round-trip through `findByTripId` and be carried on the `Spot`/`Day` model loaded from DB. **Severity: MAJOR** — UI data accuracy bug.

**Q3:** Not explicitly a domain invariant violation. The spec says auto-fill spots must be *added to Shortlist with isAutoFilled=true* — it does not say the flag must be clearable by user action. However, the current behavior is inconsistent (remove+readd clears it; re-add without remove preserves it). The intent should be documented and tested. **Severity: MINOR**.

**Q4:** Correctness gap, not a code bug. The spec says gap-fill uses the Recommender — it does not guarantee all days get filled. The warm path returning same-category spots is by design (D3). However, the emergent behavior (a single-category, single-region shortlist produces a DayPlan with unfilled days after gap-fill) is worth documenting as a known limitation. No code fix required; product decision required.

**Q5:** Yes — security and correctness issue. Authenticated traveller A accessing traveller B's tripId via the PATCH endpoint receives a 500 (unhandled ForbiddenError) instead of a 403. 500 leaks server error context, pollutes logs, and is incorrect REST semantics. **Severity: MAJOR** — one-line fix.

**Q6:** Yes — invalid action should return 400. Silent defaulting to `pin` creates a lie-by-omission API contract. Clients cannot rely on error feedback for input validation. Low complexity fix.

---

## TEST GAPS

- No test for gap-fill atomicity failure: shortlist saved, dayplan save fails — verify shortlist rollback behavior.
- No test asserting `isAutoFilled` round-trips correctly through `EditDayPlanUseCase` response after compose (currently impossible because flag is hardcoded `false`).
- No test for `ForbiddenError` → 500 regression in `PATCH /dayplan/days/:dayIndex/spots` — confirms the bug is untested.
- No test for `action: "INVALID"` → 400 in dayplan PATCH or shortlist PATCH routes.
- No test for `UpdateShortlistUseCase` re-add behavior: confirm whether is_auto_filled is cleared or preserved after remove+re-add vs. re-add without remove.
- No test covering gap-fill when warm recommender returns zero candidates (all recommendations already in shortlist) — verifies behavior when `fillCount === 0`.

---

## RESIDUAL RISKS

- **Concurrency:** Two concurrent compose requests for the same traveller could both pass the "empty days?" check, then both write different auto-filled spots to the shortlist and different dayplans. No optimistic lock or serialization guard exists.
- **LIMIT=12 in Recommender:** If `emptyDays.length > 12`, gap-fill will only partially fill even when warm candidates are diverse. The LIMIT is hardcoded and not parameterized by `emptyDays.length`.
- **Shortlist `spots` accessor:** `Shortlist` exposes `spots` as a public getter used by `ComposeDayPlanService`. If it returns the internal array by reference (not a copy), callers could mutate Shortlist state without going through `add`/`remove`. Needs inspection.
- **`updatePinnedSpots` does not track `is_auto_filled`:** Any spot manually pinned through EditDayPlan will always have `is_auto_filled=false` in `pinned_spots`, even if it was previously auto-filled. The two code paths (compose save vs. edit save) write different `is_auto_filled` values for the same logical state.

---

## VERDICT: BLOCKED

**3 MAJOR findings must be resolved before 8단계 (Architecture Improve):**

1. Gap-fill atomicity — shortlist + dayplan saves must be atomic (or compensated).
2. ForbiddenError → 500 in PATCH dayplan route — trivial fix, serious correctness gap.
3. `isAutoFilled: false` hardcoded in `EditDayPlanUseCase` — loses auto-fill context after first edit.

The 2 MINOR findings (is_auto_filled semantics, warm recommender limitation) can be resolved in 8단계 as part of architecture hardening.

---

## 2026-10-16 famous mood (Claude 독립 리뷰, ADR-0058)

Codex를 쓰지 않고 Claude가 독립 리뷰로 대신했다(ADR-0058). 대상: 6843130, 4c82e0d, f1c6b7a, 81f2c3b (ADR-0092 여섯째 기분 `famous`).

검증한 것: `npx tsc --noEmit` exit 0 · `npx vitest run` 53 files / 1224 tests pass · `SITE_URL=https://yeochana.com npm run build` (JS 40.98 + CSS 5.53 = 46.5KB gzip ≤ 50) · `check:slop` 0 · 빌드 뒤 git 작업 트리 깨끗. 따로 돌린 것: spots.json 6843130→HEAD 비교(2,964곳, 순서 같음, `famous: true` 71곳만 더함, 다른 필드 변화 0, 키 순서 `trail` 뒤·`book`/`hide` 앞 위반 0), `applyFamous` 멱등(HEAD에 다시 돌려 같음, 6843130 본에 돌리면 HEAD와 같음), 15동네 × 비 와요 켬/끔 × 다른 3곳 보기 4번(모두 3장, 먹기·카페 0), `eventProblem({e:'tap',mood:'famous'})` = null·`sub` 붙이면 거절, vite preview 375×812·320×640 실측(Chrome headless), `?mood=famous&area=seongsan&reach=drive30` → 광치기해변·섭지코지·성산일출봉. `build:spots`·e2e 전체는 돌리지 않았다.

문제 없음으로 본 것: pick.ts `candidates`(famous는 탭 없음, 밖/실내 갈림, 실내 구경 보충 안 함), 순환 키 `famous`·`store.ts` HISTORY_KEYS(옛 세션은 키가 없을 뿐 그대로 읽힘), 밤 뒤로 미루기(ADR-0091, `pool`·`nightMoved` 공유), 가 봤어요·hide(`pickSpots`·`listed`가 기분과 무관하게 먼저 거름), 아무거나(ANY_MOODS 그대로), 딥링크·이른 탭·세션 복원 목록, 수집기 `MOODS`·`handler.ts`(`mood:famous` 키), track.ts는 famous에 `sub`를 붙이지 않음, 개인정보 안내(「고른 기분」만 적음, 바꿀 것 없음), spots.json `?v=` 해시 URL이라 옛 데이터와 새 버튼이 섞이지 않음.

### MAJOR

**M1. 첫 화면 「예:」에서 유명한 데 줄이 걷기 줄과 똑같다** — `apps/web/src/home.ts:22-26`(`moodExamples` → `islandTop`/`pool`), `apps/web/src/render.ts:1253-1257`, ADR-0092 7
- 실패 장면: 처음 온 사람(위치 답 전, `제주 인기:`)은 375×812 첫 화면에서 `좀 걷고 싶어 — 제주 인기: 비자림, 천제연폭포`와 `유명한 데 가 보고 싶어 — 제주 인기: 비자림, 천제연폭포`를 사진 2장까지 똑같이 본다(preview 실측). 위치나 동네가 있을 때도 차로 30분 기준 15동네 중 6곳(애월·신제주·구좌·대정·안덕·중문)에서 두 줄의 「예:」 2곳이 같다. 유명한 곳 71곳 중 50곳이 `walk`이고 정렬(점수 → 거리)이 같아서다.
- 왜 MAJOR: ADR-0092 Context의 문제는 「어느 버튼을 눌러야 할지 모른다」인데, 새 버튼이 첫 화면에서 걷기의 복사본으로 보인다. 스펙대로 만든 결과(「예:」는 다른 줄과 같은 방식)라 코드 버그는 아니고, ADR Consequences의 「같은 곳이 함께 보일 수 있다」는 두 줄이 통째로 같은 경우까지 다루지 않았다. 주인 판단이 필요하다(예: 유명한 데 「예:」에서 같은 화면의 다른 줄에 이미 나온 곳은 건너뛰기, 아니면 그대로 받아들이고 ADR에 적기).

### MINOR

**m1. 375×667(아이폰 SE 크기)에서 `아무거나 골라줘`가 첫 화면 밖으로 밀린다** — `apps/web/index.html:106`, `specs/famous-places.md:34`(4절)
- 실측: `아무거나` 아래 끝 627 → 703. 667 높이에서는 전에는 보였고 지금은 안 보인다. 320×640에서는 `맛있는 거 먹고 싶어`(아래 끝 660)도 밖이다. 스펙 4절은 375×812만 쟀다. 모바일 우선 기준이라 작은 화면 숫자를 적고 받아들일지 정해야 한다.

**m2. 「알고 있는 빠짐」이 쇠소깍 하나만 적혀 있다** — `docs/adr/0092-famous-places-mood.md:21`, `specs/famous-places.md:18`
- 국립제주박물관(만족도 5, 원문 분류 `cultural_space`, 공영 태그 없음)은 규칙상 빠진다. 비 오는 날 구제주에서 바로 옆 민속자연사박물관은 나오는데 국립제주박물관은 안 나온다. 그 밖에 규칙대로 빠지는 이름난 곳: 이중섭거리·용연구름다리·엉덩물계곡·중문색달해변·우도봉(4점, 공영 태그 없음). 규칙을 바꾸라는 게 아니라 빠짐 목록이 실제보다 좁게 적혀 있다.

**m3. 「먹기·카페 없음」에 걸리는 유명한 곳 두 곳** — 데이터 `apps/web/public/spots.json`(보롬왓, 서귀다원), 규칙 `apps/web/scripts/famous.mjs:217-220`
- 보롬왓: 카드 이유 문장이 `넓은 들판과 꽃밭을 지나 카페에서 잠시 쉬어요`다. 표선 기준 유명한 데 「예:」 둘째 자리. 서귀다원: 사설 녹차밭(시음하는 찻집), 남원 기준 「예:」 첫째 자리. 둘 다 원문 분류가 관광지이고 태그에 카페 낱말이 없어 규칙을 통과한다. 고정 규칙 원칙상 손으로 빼지 않는다면, 최소한 ADR 2에 「카페를 겸한 관광지」가 들어온다고 적어야 한다.

**m4. 거의 같은 곳이 한 번에 3장으로 나온다** — `apps/web/src/pick.ts:216`(famous 후보), 데이터
- 신제주 다른 3곳 보기 2번째: `제주절물자연휴양림 / 백록담 / 윗세오름`, 서귀포 시내 4번째: `백록담 / 윗세오름 / 한라산국립공원`. 백록담·한라산국립공원·윗세오름·어승생악이 모두 유명한 곳이고 좌표가 산 위라 「차로 N분」이 실제(몇 시간 산행)와 다르다. 걷기에도 있던 문제지만 유명한 데는 3장 중 한라산 계열 2~3장이 함께 나와 더 눈에 띈다. 섶섬(사람이 내릴 수 없는 무인도, 좌표가 섬 위)도 서귀포·남원 유명한 데 후보다.

**m5. 수집기 테스트가 기존 `events.test.ts`에 없다** — `apps/web/tests/events.test.ts`
- `famous-pick.test.ts:98`에서 한 줄 확인은 있다. 동작은 맞다(직접 돌려 확인). 기분 목록 테스트를 두 곳에 나눠 둔 셈이라 다음 기분 추가 때 놓치기 쉽다. 낮은 MINOR.

### NIT

- n1. `apps/web/src/app.ts:1` 주석 `5 mood buttons`가 그대로다(이제 6).
- n2. `docs/adr/0092-famous-places-mood.md:19` 「실내 11곳(빛의 벙커·여미지식물원과 공영 박물관·미술관 9곳)」: 9곳에 제주세계자연유산센터·제주별빛누리공원·서귀포천문과학문화관이 들어 있어 「박물관·미술관」보다 「공영 실내 전시관」이 맞다.
- n3. `apps/web/scripts/landing.ts:65` `RESERVED`에 `famous`가 없다. 지금은 조합 쪽에 famous가 없어 문제가 없지만, ADR-0092 11대로 나중에 `/jeju/<area>/famous/` 조합 쪽을 열면 장소 slug와 겹칠 수 있다(로마자 slug라 실제 충돌 가능성은 낮다).
- n4. 우도 기준이면 유명한 데 첫 장이 `우도` 자체다(서 있는 섬을 카드로 보여 줌). 걷기에도 있던 동작.

### 요약

MAJOR 1 · MINOR 5 · NIT 4. 코드 정합성(필터·순환·밤·숨김·딥링크·수집·데이터 변화·멱등)에서는 결함을 찾지 못했다. M1은 스펙대로 만든 결과의 제품 문제라 주인 결정이 필요하다.

## 2026-10-17 i18n (Claude 독립 리뷰, ADR-0058)

Codex를 쓰지 않고 Claude가 독립 리뷰로 대신했다(ADR-0058). 대상: `5ea9af4..HEAD` 15커밋(ef37070 … bf1eb83), ADR-0093과 Amendment 1~5, `specs/i18n.md`, `plans/i18n.md`, `docs/i18n/*`.

검증한 것: `npx tsc --noEmit` exit 0 · `npx vitest run` 55 files / 1253 tests pass(한 번 돌림, 불안정한 테스트 못 봄) · `SITE_URL=https://yeochana.com npm run build` exit 0, 한국어 방문 JS 42.62 + CSS 5.56 = **48.18KB gzip ≤ 50**, 언어 청크 en 4.85·zh-Hans 5.22·ja 5.52 + apply 1.07 + CSS 0.26~0.36KB, `dist/sw.js` PRECACHE에 언어 청크·CSS·apply 없음(한국어 방문은 받지 않음 확인). 빌드 뒤 `lastmod.json` 되돌림. 따로 돌린 것: 출하 2,938곳 × 3언어 이름·소개글 빠짐 0(빠진 26곳은 모두 `hide`), 한글 남음 0, 번역 묶음의 한국어 원문과 지금 spots.json 차이 0, 금지어(泡菜·长白山·汉服·朝鲜族·日本海·Sea of Japan·竹島·Takeshima·Changbai) 출하 파일 0, GA4 `page_location`은 쿼리를 빼서 `?lang=`이 새지 않음, 지도·길찾기·검색 링크는 한국어 이름(`links.ts` `cleanName(s.name)`) 그대로. e2e·`build:spots`·브라우저 실측은 하지 않았다(M1은 코드와 빌드 산출물로 본 것이고 재현하지 않았다).

한국어 화면에 대해 문제 없음으로 본 것: `homeCopy`/`homeLede`, `metaEl`의 tag 뒤 글(`after`는 한국어에서 늘 빈 문자열), `marketRow`, `FROM_TEXT`·`TRAVEL_TEXT`·`DAY_TEXT`·`MARKET_TEXT`·`SEASON_TEXT` 리팩터는 모두 전과 같은 문자열을 만든다. 한국어에서는 첫 스크립트가 `l10n`을 붙이지 않아 가림·지연이 없다. 한국어에서 바뀌는 것은 ADR-0093 4의 두 줄(첫 화면 맨 아래 언어 줄, 설정 `언어`)과 진입 JS +0.15KB(동적 import 도우미)뿐.

### MAJOR

**M1. 배포가 한 번 있으면 다른 언어 사용자의 다음 오프라인 열기가 한국어로 뜬다(약한 신호면 앱이 아예 안 올라온다)** — `apps/web/vite.config.ts:42`(언어 청크를 precache에서 뺌), `apps/web/sw/sw.js:30`(activate가 옛 캐시를 통째로 지움), `apps/web/sw/sw.js:64`(런타임 캐시는 쓸 때만), `apps/web/src/main.ts:98`·`:163`(청크 import에 시간 제한 없음, 앱 mount가 그 뒤)
- 원인: 언어 청크는 진입 청크를 파일 이름으로 import한다(`dist/assets/en-*.js` 첫 줄 `from"./index-ary8bHJF.js"`). 그래서 앱 코드가 바뀌는 배포마다 en·zh-Hans·ja 청크 URL도 바뀐다. 새 서비스 워커는 이 청크를 미리 받지 않고, activate에서 옛 캐시(전에 쓰며 담아 둔 언어 청크 포함)를 지운다.
- 실패 장면: 일본인 여행자가 숙소 와이파이에서 앱을 연다(그 사이 배포가 있었다 → 새 SW가 백그라운드 설치·활성). 다음 날 우도 가는 배 위(오프라인)에서 다시 연다 → 새 셸은 캐시에서 나오지만 새 `ja-*.js`는 어디에도 없다 → import 실패 → `main.ts:101`이 `lang='ko'`로 돌려 화면 전체가 한국어. 한국어를 못 읽는 사람에게는 앱을 못 쓰는 것과 같다. 끊기지 않고 느린 신호(산·해안에서 흔함)면 import가 실패도 성공도 안 한 채 걸려 `start()`가 불리지 않는다: 3초 뒤 정적 한국어 첫 화면이 보이고 기분 버튼은 이른 탭 점만 찍힌 채 반응이 없다. 한국어 사용자는 같은 상황에서 precache로 정상 동작한다.
- 장소 글(`places.<lang>.json?v=`)은 내용이 바뀔 때만 URL이 바뀌어 HTTP 캐시로 대개 살아남는다. 문제는 청크 쪽이다.
- 고칠 방향(결정 필요): 새 SW install 때 옛 캐시에 언어 청크가 있었으면 새 빌드의 같은 언어 청크·CSS·apply를 함께 precache(한국어 방문은 그대로 0바이트), 또는 기억한 언어를 SW에 알려 그 언어만 받기. 그리고 청크 import에 시간 제한(예: 3초 가림과 같은 값)을 두고 넘으면 한국어로라도 mount.

### MINOR

**m1. 예약 링크의 aria-label이 한국어 장소 이름이다, 그리고 테스트가 이것을 못 잡는다** — `apps/web/src/links.ts:116`(`aria: ${cleanName(s.name)}, ${text}`), `apps/web/tests/i18n.test.ts:135`
- 실패 장면: 영어 VoiceOver 사용자가 체험 카드의 예약 버튼에서 「라이크더윈드 스튜디오, Book on Naver」처럼 한국어 이름을 듣는다(다른 aria는 `PLACE.name`으로 바뀌었는데 이것만 남았다).
- 테스트 구멍: `ui()`가 한국어 장소 이름을 포함하는 글을 모두 빼므로 이런 섞인 aria가 통과한다. 또 `n.includes(t)` 때문에 2,938곳 이름 중 하나에 들어 있는 짧은 한국어 UI 낱말(예: 「실내」, 「카페」)도 걸러져 새는 것을 놓칠 수 있다. 장소 이름 번역이 들어간 지금은 이 예외를 없애도 된다.

**m2. 장소 글 번역이 id에만 묶여 있어 spots.json이 바뀌면 조용히 낡거나 빠진다** — `apps/web/scripts/i18n-places.mjs:46-60`, 테스트 없음
- 실패 장면: 다음 `build:spots`에서 한 곳의 소개글·이름이 바뀌거나 새 곳이 출하되면, 다른 언어 화면은 옛 뜻의 번역을 그대로 보이거나 새 곳만 한국어로 보인다. 지금은 원문 차이 0·빠짐 0이지만 이를 지키는 테스트가 없다. `review/i18n/source/batch-*.json`의 원문과 현재 spots.json의 name·reason을 비교하는 테스트(다르면 실패) 하나면 막힌다.

**m3. 언어 청크가 진입 JS 실행 뒤에야 요청돼 느린 첫 방문에서 3초 가림이 끝나고 한국어가 번쩍인다; 장소 글이 목록 대기 시간 안에 들어간다** — `apps/web/vite.config.ts`(`modulePreload: false`), `apps/web/src/main.ts:94-104`·`:119`
- 실패 장면: 3G 첫 방문 중국인 여행자. 진입 JS 42.6KB를 받고 실행한 뒤에야 zh 청크를 요청하므로(선행 preload 없음, 직렬) 3초를 넘기기 쉽다 → 정적 한국어 첫 화면이 보였다가 중국어로 바뀐다(ADR-0093 2 「한국어 문구가 번쩍이지 않는다」와 어긋남). 또 `loadSpots`가 `await placesIn`으로 130KB 장소 글까지 기다려서 `createSpotSource`의 10초 제한(`data.ts:118`)을 한국어보다 쉽게 넘긴다 → 목록 실패 안내가 잠깐 보인다. 장소 글은 목록 뒤에 와도 되게(이름·소개글만 다시 그리기) 하거나, index.html 첫 스크립트에서 고른 언어의 청크를 `<link rel=modulepreload>`로 일찍 거는 방법이 있다.

**m4. 번역 표본 20곳 × 3언어 직접 점검: en 1 · zh-Hans 2 · ja 2곳 지적** (시드 `claude-review-1017`, 원어민 편집자 관점)
- ja `문어빵굽는문빵9` → `ムノパンクムヌンムンパン9`: 한국어 문장형 상호를 통째 음역해 일본어로 뜻이 없다(en `Munppang 9`·zh `章鱼包9`처럼 줄이는 편이 맞다). 이름 오류.
- zh `마모루` → `守`: 일본어 「守る」를 뜻으로 옮긴 한 글자 상호라 간판(가타카나/로마자)과 연결이 안 된다. `Mamoru`/음역 쪽이 찾기 쉽다.
- zh·ja `미천굴` → `美川窟` / `美千窟`: 두 언어의 한자가 서로 다르다. 적어도 하나는 틀렸다(확인 실패, 원 한자 표기 확인 필요). 이 곳은 ja 지적 둘째로 센다.
- zh `드림회센터` → `梦想生鱼片中心`: 상호 직역, 번역투(마).
- en `신화워터파크` → `Stay at the Shinhwa Hotel to get in, along with the sky pool`: 어순이 어색하다(마).
- 나머지는 뜻·말투 문제 없음. 20곳이라 비율로 일반화하지 않는다.

### NIT

- n1. 금지어 테스트 빈칸: `apps/web/tests/i18n-terms.test.ts:9-14` ja에 `泡菜`, zh-Hans에 번체 `漢服`·`朝鮮族`이 없다(지금 출하 파일엔 없음 확인).
- n2. `?lang=`은 앱이 주소에서 지우므로(app.ts readArrival) localStorage를 못 쓰는 브라우저에서는 새로 고침하면 고른 언어가 사라진다. 또 `keep.ts:159-162` `handoffUrl`(인앱 브라우저 → 폰 브라우저)이 `lang`을 넘기지 않아, 인앱에서 언어를 고른 사람은 폰 브라우저의 언어 목록대로 다시 고른다(목록에 한국어가 있으면 한국어).
- n3. 언어를 바꾼 뒤 뒤로 가기는 bfcache가 살린 옛 언어 페이지를 그대로 보여 줄 수 있다(저장된 언어와 화면이 다름). 새로 고침하면 맞아진다.
- n4. `docs/adr/0093-english-chinese-japanese.md:28` Decision 9 「시각은 모두 한국 시각 24시간제」가 Amendment 3(en-US는 `5:58 PM`)과 어긋나는데, 6처럼 취소선·대체 표시가 없다.
- n5. `?lang=zh`·`zh-CN`은 무시된다(`zh-hans`만 받음). llms.txt에 정확한 값이 적혀 있어 문제는 작다.

### 요약

MAJOR 1 · MINOR 4 · NIT 5. 한국어 화면·번들·첫 그림·사용 기록은 바뀐 것이 ADR이 말한 두 줄뿐이고 예산 안이다. 번역 범위(2,938곳 × 3, 이름·소개글)·금지어·지도 링크(한국어 이름)·개인정보 안내(보내는 것 그대로, 「고른 언어」만 기기 저장)는 맞다. M1은 오프라인 PWA에서 다른 언어 사용자만 깨지는 경로라 배포 전에 정할 일이다.

## 2026-10-20 부산 출시 (Claude 독립 리뷰, ADR-0058)

Codex를 쓰지 않고 Claude가 독립 리뷰로 대신했다(ADR-0058). 대상: `529201a..HEAD` 48커밋(d1c3f17 … d4a6e82), ADR-0094~0098, `specs/busan.md`, `plans/busan.md`, `docs/context.md`. 코드는 고치지 않았다.

검증한 것(각 1회): `npx tsc --noEmit` exit 0 · `npm test` 65 files / 1396 pass(15 skip) · `npm run test:busan` 66 files / 1411 pass · `SITE_URL=https://yeochana.com npm run build` exit 0(켠 빌드, 진입 JS 43.69 + CSS 5.62KB gzip, `busan-part` 청크 2.01KB, `dist/_headers`에 `/spots-busan.json` immutable 줄 있음, sw.js PRECACHE에 busan-part 있고 spots-busan.json 없음) · `npm run check:jeju` exit 0(진입 49,312 B ≤ 50,000, 인라인 블록 +1,998 B ≤ 2,000, 제주 데이터·파일·precache·함수·브라우저 2기기 그대로) · e2e `E2E_ONLY=^BS-` 6/6 PASS(B1·B2·B3·M4·B13·M5, Googlebot 덮개 100%지만 h1·.lede·기분 목록 DOM에 있음). 빌드 뒤 `data/landing/lastmod.json` 되돌림, `dist/`는 켠 운영 빌드로 둠. **전체 e2e(제주 쪽 포함)는 확인 실패**: 백그라운드 실행이 출력 없이 끝나 결과를 읽지 못했다(통과로 적지 않는다).

따로 돌린 것: `spots-busan.json` 994곳, id 전부 `bs-<숫자>`·중복 0, 좌표 994곳 모두 `inBusan` 안·제주 0, famous 61(pop 없는 곳 0), trail 16, market 1(구포 3·8일), 체험 book 45(네이버·홈페이지·전화), 사진 없음 192, HTML 엔티티·빈 이유 0, 「(부산)」 꼬리 0. `node scripts/busan/build.mjs` 다시 돌려 해시 같음(멱등). 금지어(泡菜·长白·日本海·東海·竹島 등) i18n·공개 HTML·llms.txt 0. 리뷰용 브라우저 점검(저장소 밖 스크립트): 새 브라우저가 고르지 않고 나갔다 오면 저장 키 0·시작 화면 다시 뜸 / `jeju.basis`·`jeju.region`·`jeju.visited`만 있는 옛 기기 → 시작 화면 없이 제주·「애월 근처」·키 그대로(+`jeju.dest`) / 권한 granted·서울 → 덮개에 밖 문구, 읽기 1회 / 부산 청크 2초 늦고 그 전에 「부산」 누름 → 여차나:부산 / 부산 카드 6기분: 네이버 검색 링크 끝 「부산」(이름에 부산 있으면 안 붙임), 출처 「정보·사진: 한국관광공사」, 랜딩 줄 숨김, 문서 제목 바뀜, 페이지 오류 0 / 제주 기기·GPS 기준·해운대 granted → 부산으로 자동 전환(spec 1.3대로).

제주 사용자에게 문제 없음으로 본 것: 옛 기기(아무 `jeju.` 키)·`/jeju/**` referrer·제주 딥링크는 시작 화면 없이 제주. 저장 키는 그대로 읽고 `jeju.dest`만 더한다(ADR-0097). 수집기는 같은 배포의 Functions라 새 필드 `dest`·`start_*`를 받고, 옛 앱의 배치도 그대로 받는다. sw.js는 옛 캐시의 spots-busan.json만 넘겨받고(지금 배포본엔 없음 → no-op), 부산 장소 파일은 처음 쓸 때 런타임 캐시에 든다. 비·장날·해·밤은 `s.dest`로 갈린 곳 말고 제주 계산 그대로.

### MAJOR

없음.

### MINOR

**m1. 부산 청크가 4초 안에 안 오거나 실패하면 새 기기에 `jeju.dest="jeju"`를 영구히 쓴다(그 사이 누른 「내 위치로 시작하기」도 버려진다)** — `apps/web/src/app.ts:180`(`if (!starting && dest0 === want) store.setDest(dest0)`), `apps/web/src/main.ts:193`(`within(loadBusan(), 4000)`)
- 재현: 새 브라우저에서 `assets/busan-part-*.js`를 막으면 1.5초 뒤 덮개가 걷히고 `jeju.dest="jeju"`가 남는다. 다시 열어도 시작 화면 없이 제주. 청크를 6초 늦추고 0.4초에 큰 버튼을 누르면 위치 읽기 0회, 4초 뒤 제주로 열리고 역시 `jeju.dest="jeju"`.
- 왜 문제: ADR-0098 1은 「4초 안에 못 받으면 덮개를 걷고 제주로 연다(기기에 남긴 선택은 그대로)」, app.ts 주석도 「Jeju for this visit」인데, 고른 적 없는 기기에 선택을 만들어 쓴다. 느린 망·인앱 브라우저의 부산 첫 방문자가 시작 화면을 다시 못 본다. GPS 기준이라 기분을 누르면 `followGps`로 부산에 오긴 하지만, 위치를 거절한 사람은 기준 시트 여행지 줄을 찾아야 한다.
- 고치는 방향: 덮개가 떠 있었던 마운트(`yc-start`가 처음에 있었음)에서는 `setDest`를 하지 않는다.

**m2. 영어 개인정보 안내의 위치 문단이 문장 중간에서 끊겼다** — `apps/web/public/privacy-en.html:52`
- 「The first time you open the app, a start screen appears; tapping  Links to outside map apps…」: 한국어·중국어·일본어판에 있는 「‘내 위치로 시작하기’를 누르면 위치를 물어요」에 해당하는 말이 빠지고 다음 문장과 붙었다. 네 언어 안내가 같은 것을 말하지 않는다.

### NIT

- n1. 켠 빌드 인라인 블록 gzip +1,998 B, 상한 2,000 B(`check:jeju`). 시작 화면 문구 한 줄만 고쳐도 검사가 깨진다. 여유를 정해 두거나 상한을 ADR에 다시 적을 일.
- n2. `apps/web/src/i18n/zh-Hans.ts:191` 등 「韩国观光公社」 — 한국관광공사 중국어 공식 이름은 「韩国旅游发展局」(공사 중국어 사이트 표기). 한국 공식 표기 우선 규칙(docs/i18n/place-terms.md)과 맞출지 정할 것.
- n3. 큰 버튼을 청크가 오기 전에 누르면 최대 4초 동안 버튼이 그대로다(`위치 확인 중…`은 앱이 와야 나온다). 인라인 onclick에서 글자만 바꿔 두면 된다.
- n4. `apps/web/src/keep.ts:160` `handoffUrl`은 여행지를 싣지 않는다. 인앱 브라우저의 부산 사용자가 「브라우저로 열기」를 누르면 새 브라우저에서 시작 화면을 다시 본다.
- n5. 저장소에 `lang`만 있는 기기는 `jeju.` 키가 아니라서 시작 화면을 본다(인라인 판정). 그런 기기는 드물고 해는 작다.

### 요약

MAJOR 0 · MINOR 2 · NIT 5. 제주 쪽은 의도한 추가(기준 시트 여행지 줄·저장한 곳 다른 여행지 줄·안내 몇 줄) 말고 바뀐 것을 찾지 못했고 `check:jeju`가 같다고 본다. 부산 데이터 994곳은 경계·id·유명한 곳·밤 산길·예약 경로·멱등 모두 맞다. 배포 전에 m1(청크 실패 때 `jeju.dest` 쓰기)과 m2(영어 안내 끊긴 문장)를 고칠지 정할 일. 전체 e2e는 이번에 결과를 못 읽었으니 배포 전에 한 번 더 돌려 볼 것.

## 2026-10-24 부산 번역 (Claude 독립 리뷰, ADR-0058)

Codex를 쓰지 않고 Claude가 독립 리뷰로 대신했다(ADR-0058). 대상: `fc7306b5..HEAD` 6커밋(5cd4942e docs, d3c167c9 n3·n4, afa19614·064b0830·ebdf5cb8·3c5e3084 부산 장소 글 en·zh-Hans·ja, ADR-0093 Amendment 9, ADR-0096 Amendment 1). 코드는 고치지 않았다.

검증한 것(각 1회): `npx tsc --noEmit` exit 0 · `npx vitest run` 65 files / 1412 pass(18 skip) · `npx vitest run --mode busan` 67 files / 1430 pass · `SITE_URL=https://yeochana.com npm run build` exit 0(켠 빌드, 진입 JS 43.80 + CSS 5.62KB gzip, `busan-part` 2.49KB, `dist/i18n/places-busan.{en,zh-Hans,ja}.json` 116·92·136KB) · `npm run check:jeju` exit 0(한국어 진입 49,421 B ≤ 50,000, 기준선 대비 +881 B; 인라인 블록 +1,766 B ≤ 2,000; 제주 데이터·60 파일·precache·함수·브라우저 2기기 그대로). 빌드 뒤 `data/landing/lastmod.json` 되돌림, `dist/`는 켠 운영 빌드로 둠. e2e는 돌리지 않았다(요청 범위 밖, 통과로 적지 않는다).

따로 본 것: 세 언어 파일 모두 994/994곳, 빈 이름·이유 0, 한글 남은 곳 0, 제주 `places.<lang>.json`과 id 겹침 0. 금지어(泡菜·长白山·日本海·Sea of Japan·竹島·韩国观光公社 등) 0, 辛奇 10·东海/東海 5·East Sea 2·独岛/独島 각 1. 코드 경로: 부산 글은 `loadSpots('busan')`에서 언어 모듈이 들어온 뒤에만 받고(마운트는 `words()`를 기다리므로 `inLang`은 마운트 때 이미 있음), 실패·오프라인이면 `json()`이 null → 표에 안 들어가 한국어로 보이고 숨김은 없다(3초 상한, Amendment 6과 같음). sw.js는 미리 받지 않고 런타임 캐시에 들며, 새 워커는 옛 캐시에 같은 이름 파일이 있을 때만 새 판을 받는다(지금 배포본엔 없음 → 첫 업데이트는 no-op, 파일마다 `.catch`). `BUSAN_FILES`가 템플릿에 들어가 VERSION 해시에 반영된다. `dest=`는 인라인·앱 모두 `jeju|busan` 정규식만 받아 값이 HTML·URL로 다시 나가지 않는다(XSS·열린 리다이렉트 없음). 부산 몫이 안 오면 이번 방문만 제주, 기기 선택은 안 쓴다. 꺼진 빌드는 `dist/`에서 세 파일을 지운다.

번역 표본(sample-01과 겹치지 않게 `sha256(id+"rev-1024")` 앞 20곳, 원어민 편집자 관점, 한 번만): en (가)~(라) 0 · 번역투 2 · 언어 간 이름 어긋남 1 / zh-Hans (가)~(라) 1 · 번역투 2 / ja (가)~(라) 0 · 번역투 1. zh 「XX 总店」→「XX总店」 34곳 붙여 쓰기는 중국어 점포명 관례(大众点评 「海底捞王府井店」 꼴)와 맞아 자연스럽다.

### MAJOR

없음.

### MINOR

**m1. 둔치도 중국어 표기 「屯治岛」 — 한자는 屯致島(일본어판도 「屯致島」)** — `apps/web/review/i18n/busan/zh-Hans/reasons-004.json:74`
- 중국어 카드(bs-2903578 금빛노을 소개글)에 다른 한자 지명이 나간다. 같은 곳이 일본어판과 다르다. 「屯致岛」로 고치고 place-terms.md에 한 줄 넣을 일.

### NIT

- n1. `apps/web/review/i18n/busan/en/names-007.json:36` 「Foody 1354」 vs `zh-Hans/names-007.json:36` 「Foodie 1354」(bs-2869249 푸디1354): 라틴 이름이 언어마다 다르다. 실제 상호 철자 하나로 맞출 것.
- n2. `apps/web/index.html:17` 인라인 판정은 `dest=`를 `area=`(부산 slug만)·`stay=` 다음, 제주 딥링크 키 앞에 본다. 앱(`src/app.ts:188`)은 제주 동네 `area=`를 `dest=`보다 먼저 쓴다. 손으로 만든 `?area=aewol&dest=busan`이면 인라인은 부산으로 보고 부산 몫을 미리 받지만 앱은 제주로 연다. `handoffUrl`은 `area`를 싣지 않아 앱이 만든 링크에선 안 생긴다. 해는 쓸데없는 청크 한 번.
- n3. `apps/web/src/start.ts:55` 거절·못 찾음·밖 문구를 `documentElement.lang`으로 고른다. 언어 청크가 4초 안에 안 와 `lang`이 `ko`로 돌아간 기기는 시작 화면 제목·버튼(인라인 `__ycT`, 원래 언어)과 실패 문구(한국어)가 섞인다. 드문 경우.
- n4. 번역투 표본 예: en bs-2824044 「mulhoe soba」 풀이 없음(ja는 풀이 있음), zh bs-2785956 「汤小麦面」·bs-3027098 「头号城门」. 출시 막을 것 아님.

### 요약

MAJOR 0 · MINOR 1 · NIT 4. 제주 사용자: 진입 +881 B로 예산 안, `check:jeju` 같음, 꺼진 빌드엔 부산 글 파일이 없고 제주만 쓰는 외국어 기기는 부산 글을 받지 않는다. 부산 외국어: 번역 이름·소개글이 들어가고, 파일 실패·오프라인이면 한국어로 내려앉고 멈춘 숨김은 없다. `dest=`는 값 검증만 받고 링크로 온 방문에서만 기기 선택을 바꾼다(ADR-0096 Amendment 1 그대로). 배포 전 m1(屯治岛) 한 줄 고칠지 정할 일. e2e는 이번에 돌리지 않았다.
