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
